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

  it("should return the scheduler's next job", async function () {
    const scheduler = await queue.upsertJobScheduler(
      'daily',
      { pattern: '0 0 * * *' },
      { name: 'daily-job', data: { foo: 'bar' } },
    );
    const provider = new RepeatableJobProvider({ queue });

    const job = await provider.get('daily');
    const next = (await queue.getJobScheduler('daily'))?.next;

    expect(job.id).to.equal(`repeat:daily:${next}`);
    expect(job.id).to.equal(scheduler.id);
    expect(job.name).to.equal('daily-job');
    expect(job.data).to.deep.equal({ foo: 'bar' });
    expect(job.repeatJobKey).to.equal('daily');
    expect(job.opts.repeat?.pattern).to.equal('0 0 * * *');
    expect(job.timestamp + job.delay).to.equal(next);
  });

  it('should throw ResourceNotFoundError for an unknown scheduler id', async function () {
    const provider = new RepeatableJobProvider({ queue });

    const err = await provider.get('missing').catch(e => e);

    expect(err).to.be.instanceOf(ResourceNotFoundError);
    expect(err.resource).to.equal('JobScheduler');
    expect(err.id).to.equal('missing');
  });

  it('should throw ResourceNotFoundError when the next job is gone', async function () {
    const job = await queue.upsertJobScheduler('hourly', {
      pattern: '0 * * * *',
    });
    const client = await queue.client;
    await client.zrem(queue.toKey('delayed'), job.id as string);
    await client.del(queue.toKey(job.id as string));
    const provider = new RepeatableJobProvider({ queue });

    const err = await provider.get('hourly').catch(e => e);

    expect(err).to.be.instanceOf(ResourceNotFoundError);
    expect(err.resource).to.equal('Job');
    expect(err.id).to.equal(job.id);
  });

  it('should use the provided jobProvider to fetch the next job', async function () {
    await queue.upsertJobScheduler('daily', { pattern: '0 0 * * *' });
    const requestedIds: string[] = [];
    const expected = await queue.add('other', {});
    const jobProvider = {
      get: async (id: string) => {
        requestedIds.push(id);

        return expected;
      },
    };
    const provider = new RepeatableJobProvider({ queue, jobProvider });

    const job = await provider.get('daily');
    const next = (await queue.getJobScheduler('daily'))?.next;

    expect(requestedIds).to.deep.equal([`repeat:daily:${next}`]);
    expect(job).to.equal(expected);
  });

  it('should return the job even when it has already started', async function () {
    await queue.upsertJobScheduler('daily', { pattern: '0 0 * * *' });
    const running = await queue.add('running', {});
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
        jobProvider: () => queue.getJob(running.id as string) as Promise<Job>,
      });

      expect(await running.getState()).to.equal('active');
      const job = await provider.get('daily');

      expect(job.id).to.equal(running.id);
      expect(await job.getState()).to.equal('active');
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
