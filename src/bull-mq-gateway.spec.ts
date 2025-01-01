import { expect, use } from 'chai';
import { fake, match } from 'sinon';
import sinonChai from 'sinon-chai';

import { Event, EventBuilder, EventHandlerFn } from '@sektek/synaptik';
import { Job, Queue } from 'bullmq';

import { BullMqChannel } from './bull-mq-channel.js';
import { BullMqGateway } from './bull-mq-gateway.js';

use(sinonChai);

const WAIT_TIME = 500;
const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;
const connection = { host, port };

describe('BullMqGateway', function () {
  let channel: BullMqChannel;
  let event: Event;
  let gateway: BullMqGateway;
  let queue: Queue;
  let handler: EventHandlerFn;

  before(function () {
    queue = new Queue('test', { connection });
    channel = new BullMqChannel({ queue });
  });

  beforeEach(async function () {
    event = await EventBuilder.create();
    handler = fake();
  });

  afterEach(async function () {
    await gateway.shutdown();
    await queue.drain();
  });

  after(async function () {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('should pass the event to the handler', async function () {
    gateway = new BullMqGateway({ connection, queue, handler });
    await gateway.start();

    await channel.send(event);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

    expect(handler).to.have.been.calledWith(event);
  });

  it('should emit the job:received event', async function () {
    let job: Job | undefined;
    const jobCreated = (j: Job) => {
      job = j;
    };
    channel.once('job:created', jobCreated);

    gateway = new BullMqGateway({ connection, queue, handler });
    const jobReceived = fake();

    gateway.on('job:received', jobReceived);
    await gateway.start();

    await channel.send(event);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

    expect(jobReceived).to.have.been.calledWith(match.has('id', job?.id));
  });

  it('should emit the event:received event', async function () {
    gateway = new BullMqGateway({ connection, queue, handler });
    const eventReceived = fake();

    gateway.on('event:received', eventReceived);
    await gateway.start();

    await channel.send(event);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

    expect(eventReceived).to.have.been.calledWith(event);
  });

  it('should emit the event:processed event', async function () {
    gateway = new BullMqGateway({ connection, queue, handler });
    const eventProcessed = fake();
    gateway.on('event:processed', eventProcessed);
    gateway.start();

    await channel.send(event);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

    expect(eventProcessed).to.have.been.calledWith(event);
  });

  it('should emit the job:completed event', async function () {
    let job: Job | undefined;
    channel.once('job:created', (j: Job) => {
      job = j;
    });
    const event = await EventBuilder.create();
    gateway = new BullMqGateway({ connection, queue, handler });
    const jobCompleted = fake();
    gateway.on('job:completed', jobCompleted);
    await gateway.start();

    await channel.send(event);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

    expect(jobCompleted).to.have.been.calledWith(match.has('id', job?.id));
  });

  it('should emit the event:error event', async function () {
    const err = new Error('test');
    handler = fake.throws(err);
    const eventErrorListener = fake();

    gateway = new BullMqGateway({ connection, queue, handler });
    gateway.on('event:error', eventErrorListener);
    await gateway.start();

    await channel.send(event);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

    expect(eventErrorListener).to.have.been.calledWith(event, err);
  });

  it('should emit the job:error event', async function () {
    let job: Job | undefined;
    channel.once('job:created', (j: Job) => {
      job = j;
    });

    const err = new Error('test');
    handler = fake.throws(err);
    gateway = new BullMqGateway({ connection, queue, handler });
    const jobError = fake();
    gateway.on('job:error', jobError);
    await gateway.start();

    await channel.send(event);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

    expect(jobError).to.have.been.calledWith(match.has('id', job?.id), err);
  });

  describe('with a custom event extractor', function () {
    it('should use the custom event extractor', async function () {
      let job: Job | undefined;
      channel.once('job:created', (j: Job) => {
        job = j;
      });
      const eventExtractor = fake.returns(event);
      gateway = new BullMqGateway({
        connection,
        queue,
        handler,
        eventExtractor,
      });
      await gateway.start();

      await channel.send(event);
      await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

      expect(eventExtractor).to.have.been.calledWith(match.has('id', job?.id));
      expect(eventExtractor).to.have.been.calledWith(match.has('data', event));
    });
  });
});
