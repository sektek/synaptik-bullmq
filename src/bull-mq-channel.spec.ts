import { expect, use } from 'chai';
import { fake } from 'sinon';
import sinonChai from 'sinon-chai';

import { EventBuilder } from '@sektek/synaptik';
import { Queue } from 'bullmq';

import { BullMqChannel } from './bull-mq-channel.js';

use(sinonChai);

const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

describe('BullMqChannel', function () {
  let queue: Queue;

  before(function () {
    queue = new Queue('test', { connection: { host, port } });
  });

  afterEach(async function () {
    await queue.drain();
  });

  after(async function () {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('should send an event to the queue', async function () {
    const event = await EventBuilder.create();
    const channel = new BullMqChannel({ queue });

    await channel.send(event);

    const job = await queue.getJob(event.id);
    expect(job).to.exist;
    expect(job.data).to.deep.equal(event);
  });

  it('should use the jobNameProvider to set the job name', async function () {
    const event = await EventBuilder.create();
    const jobNameProvider = fake.returns('test-job');
    const channel = new BullMqChannel({ queue, jobNameProvider });

    await channel.send(event);

    expect(jobNameProvider).to.have.been.calledWith(event);
    const job = await queue.getJob('test-job');
    expect(job).to.exist;
    expect(job.data).to.deep.equal(event);
  });

  it('should use the jobsOptionsProvider to set the job options', async function () {
    const jobsOptionsProvider = fake.returns({ jobId: 'test-job' });
    const channel = new BullMqChannel({ queue, jobsOptionsProvider });

    const event = await EventBuilder.create();
    await channel.send(event);

    expect(jobsOptionsProvider).to.have.been.calledWith(event, event.id);
    const job = await queue.getJob('test-job');
    expect(job).to.exist;
    expect(job.data).to.deep.equal(event);
  });
});
