import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';

import { EventBuilder } from '@sektek/synaptik';
import { Queue } from 'bullmq';

import { BullMqChannel } from './bull-mq-channel.js';

use(chaiAsPromised);
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
    const jobNameProvider = sinon.fake.returns('test-job');
    const channel = new BullMqChannel({ queue, jobNameProvider });

    await channel.send(event);

    expect(jobNameProvider).to.have.been.calledWith(event);
    const job = await queue.getJob('test-job');
    expect(job).to.exist;
    expect(job.data).to.deep.equal(event);
  });

  it('should use the jobsOptionsProvider to set the job options', async function () {
    const jobsOptionsProvider = sinon.fake.returns({ jobId: 'test-job' });
    const channel = new BullMqChannel({ queue, jobsOptionsProvider });

    const event = await EventBuilder.create();
    await channel.send(event);

    expect(jobsOptionsProvider).to.have.been.calledWith(event, event.id);
    const job = await queue.getJob('test-job');
    expect(job).to.exist;
    expect(job.data).to.deep.equal(event);
  });

  it('should emit an event:received event when the event is received', async function () {
    const event = await EventBuilder.create();
    const channel = new BullMqChannel({ queue });
    const eventReceived = sinon.fake();

    channel.on('event:received', eventReceived);
    await channel.send(event);

    expect(eventReceived).to.have.been.calledWith(event);
  });

  it('should emit an event:received event even when there is an error', async function () {
    const error = new Error('Test error');
    const event = await EventBuilder.create();
    const jobsOptionsProvider = sinon.fake.throws(error);
    const channel = new BullMqChannel({ queue, jobsOptionsProvider });
    const eventReceived = sinon.fake();

    channel.on('event:received', eventReceived);
    await expect(channel.send(event)).to.eventually.be.rejectedWith(error);

    expect(eventReceived).to.have.been.calledWith(event);
  });

  it('should emit an event:delivered event when the event is delivered', async function () {
    const event = await EventBuilder.create();
    const channel = new BullMqChannel({ queue });
    const eventDelivered = sinon.fake();

    channel.on('event:delivered', eventDelivered);
    await channel.send(event);

    expect(eventDelivered).to.have.been.calledWith(event);
  });

  it('should emit an event:error event when there is an error sending the event', async function () {
    const error = new Error('Test error');
    const event = await EventBuilder.create();
    const jobsOptionsProvider = sinon.fake.throws(error);
    const channel = new BullMqChannel({ queue, jobsOptionsProvider });
    const eventErrorListener = sinon.fake();

    channel.on('event:error', eventErrorListener);
    await expect(channel.send(event)).to.eventually.be.rejectedWith(error);

    expect(eventErrorListener).to.have.been.calledWith(error, event);
  });
});
