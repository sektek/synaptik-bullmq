import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { Job, Queue, Worker } from 'bullmq';
import { ResourceNotFoundError } from '@sektek/utility-belt';

import { RepeatableJobProvider } from './repeatable-job-provider.js';

use(chaiAsPromised);

const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

describe('RepeatableJobProvider', function () {
  let queue: Queue;

  before(function () {
    queue = new Queue('test-repeatable-job-provider', {
      connection: { host, port },
    });
  });

  afterEach(async function () {
    await queue.obliterate({ force: true });
  });

  after(async function () {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('should return the scheduler and its next job', async function () {
    await queue.upsertJobScheduler(
      'daily',
      { pattern: '0 0 * * *' },
      { name: 'daily-job', data: { foo: 'bar' } },
    );
    const provider = new RepeatableJobProvider({ queue });

    const result = await provider.get('daily');

    expect(result).to.exist;
    expect(result?.scheduler.pattern).to.equal('0 0 * * *');
    expect(result?.scheduler.next).to.be.a('number');
    expect(result?.nextJob).to.exist;
    expect(result?.nextJob?.id).to.equal(
      `repeat:daily:${result?.scheduler.next}`,
    );
    expect(result?.nextJob?.name).to.equal('daily-job');
    expect(result?.nextJob?.data).to.deep.equal({ foo: 'bar' });
    expect(result?.nextJob?.opts.delay).to.be.a('number');
    expect(
      (result?.nextJob?.timestamp ?? 0) + (result?.nextJob?.delay ?? 0),
    ).to.equal(result?.scheduler.next);
  });

  it('should throw ResourceNotFoundError for an unknown scheduler id', async function () {
    const provider = new RepeatableJobProvider({ queue });

    const err = await provider.get('missing').catch(e => e);

    expect(err).to.be.instanceOf(ResourceNotFoundError);
    expect(err.resource).to.equal('JobScheduler');
    expect(err.id).to.equal('missing');
  });

  it('should return an undefined nextJob when the next job is gone', async function () {
    const job = await queue.upsertJobScheduler('hourly', {
      pattern: '0 * * * *',
    });
    const client = await queue.client;
    await client.zrem(queue.toKey('delayed'), job.id as string);
    await client.del(queue.toKey(job.id as string));
    const provider = new RepeatableJobProvider({ queue });

    const result = await provider.get('hourly');

    expect(result?.scheduler).to.exist;
    expect(result?.nextJob).to.be.undefined;
  });

  it('should use the provided jobProvider to fetch the next job', async function () {
    await queue.upsertJobScheduler('daily', { pattern: '0 0 * * *' });
    const requestedIds: string[] = [];
    const jobProvider = {
      get: async (id: string) => {
        requestedIds.push(id);
        throw new ResourceNotFoundError({ resource: 'Job', id });
      },
    };
    const provider = new RepeatableJobProvider({ queue, jobProvider });

    const result = await provider.get('daily');

    expect(requestedIds).to.deep.equal([
      `repeat:daily:${result?.scheduler.next}`,
    ]);
    expect(result?.nextJob).to.be.undefined;
  });

  it('should return an undefined nextJob when the job has already started', async function () {
    await queue.upsertJobScheduler('daily', { pattern: '0 0 * * *' });
    const job = await queue.add('running', {});
    let release: () => void = () => undefined;
    const blocker = new Promise<void>(resolve => (release = resolve));
    let started: () => void = () => undefined;
    const active = new Promise<void>(resolve => (started = resolve));
    const worker = new Worker(
      queue.name,
      async () => {
        started();
        await blocker;
      },
      { connection: { host, port } },
    );

    try {
      await active;
      const provider = new RepeatableJobProvider({
        queue,
        jobProvider: () => queue.getJob(job.id as string) as Promise<Job>,
      });

      expect(await job.getState()).to.equal('active');
      expect((await provider.get('daily')).nextJob).to.be.undefined;
    } finally {
      release();
      await worker.close();
    }
  });

  it('should rethrow other errors from the jobProvider', async function () {
    await queue.upsertJobScheduler('daily', { pattern: '0 0 * * *' });
    const error = new Error('boom');
    const jobProvider = {
      get: async (): Promise<never> => {
        throw error;
      },
    };
    const provider = new RepeatableJobProvider({ queue, jobProvider });

    await expect(provider.get('daily')).to.be.rejectedWith(error);
  });
});
