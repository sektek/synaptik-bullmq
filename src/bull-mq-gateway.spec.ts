import { Event, EventBuilder, EventHandlerFn } from '@sektek/synaptik';
import { Job, Queue, Worker } from 'bullmq';
import {
  ProcessManager,
  SERVICE_STARTED,
  SERVICE_START_ERROR,
  SERVICE_STOPPED,
  SERVICE_STOP_ERROR,
  isStartable,
  isStoppable,
} from '@sektek/utility-belt';
import { expect, use } from 'chai';
import { fake, match, restore, stub } from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';

import { BullMqChannel } from './bull-mq-channel.js';
import { BullMqGateway } from './bull-mq-gateway.js';

use(sinonChai);
use(chaiAsPromised);

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
    restore();
    await gateway.stop();
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

    expect(eventErrorListener).to.have.been.calledWith(err, event);
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

    expect(jobError).to.have.been.calledWith(err, match.has('id', job?.id));
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

  describe('with workerOptions', function () {
    let inFlight: number;
    let maxInFlight: number;

    const trackingHandler = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, WAIT_TIME / 2));
      inFlight--;
    };

    const sendEvents = async (count: number) => {
      for (let i = 0; i < count; i++) {
        await channel.send(await EventBuilder.create());
      }
    };

    beforeEach(function () {
      inFlight = 0;
      maxInFlight = 0;
    });

    it('should apply the worker options to the worker', async function () {
      gateway = new BullMqGateway({
        connection,
        queue,
        handler: trackingHandler,
        workerOptions: { concurrency: 3 },
      });
      await gateway.start();

      await sendEvents(3);
      await new Promise(resolve => setTimeout(resolve, WAIT_TIME * 2));

      expect(maxInFlight).to.equal(3);
    });

    it('should process one job at a time by default', async function () {
      gateway = new BullMqGateway({
        connection,
        queue,
        handler: trackingHandler,
      });
      await gateway.start();

      await sendEvents(3);
      await new Promise(resolve => setTimeout(resolve, WAIT_TIME * 3));

      expect(maxInFlight).to.equal(1);
    });

    it('should prefer the connection option over workerOptions', async function () {
      const workerOptions = {
        concurrency: 2,
        connection: {
          host: 'unreachable.invalid',
          port: 1,
          db: 5,
        },
      };
      gateway = new BullMqGateway({
        connection,
        queue,
        handler,
        workerOptions,
      });
      await gateway.start();

      await channel.send(event);
      await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

      expect(handler).to.have.been.calledWith(event);
    });
  });

  describe('with blockingConnection', function () {
    it('should process jobs with the option set', async function () {
      gateway = new BullMqGateway({
        connection,
        queue,
        handler,
        blockingConnection: true,
      });
      await gateway.start();

      await channel.send(event);
      await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

      expect(handler).to.have.been.calledWith(event);
    });
  });

  describe('lifecycle', function () {
    const settle = () =>
      new Promise(resolve => setTimeout(resolve, WAIT_TIME / 5));

    it('should emit service:started then service:stopped once each', async function () {
      const started = fake();
      const stopped = fake();
      gateway = new BullMqGateway({ connection, queue, handler });
      gateway.on(SERVICE_STARTED, started).on(SERVICE_STOPPED, stopped);

      await gateway.start();
      await settle();

      expect(started).to.have.been.calledOnce;
      expect(stopped).to.not.have.been.called;

      await gateway.stop();

      expect(started).to.have.been.calledOnce;
      expect(stopped).to.have.been.calledOnce;
      expect(started).to.have.been.calledBefore(stopped);
    });

    it('should emit service:startError and rethrow the same error when start fails', async function () {
      const startError = fake();
      const started = fake();
      const err = new Error('start failed');
      stub(Worker.prototype, 'on').throws(err);
      gateway = new BullMqGateway({ connection, queue, handler });
      gateway.on(SERVICE_START_ERROR, startError).on(SERVICE_STARTED, started);

      await expect(gateway.start()).to.be.rejectedWith(err);

      expect(startError).to.have.been.calledOnceWithExactly(err);
      expect(started).to.not.have.been.called;
      await settle();
      restore();
      await gateway.stop();
    });

    it('should emit service:stopped only after the worker is closed', async function () {
      const stopped = fake();
      gateway = new BullMqGateway({ connection, queue, handler });
      gateway.on(SERVICE_STOPPED, stopped);
      await gateway.start();
      await settle();
      const close = stub(Worker.prototype, 'close').callThrough();

      await gateway.stop();

      expect(close).to.have.been.calledOnce;
      expect(stopped).to.have.been.calledAfter(close);
    });

    it('should emit service:stopError and rethrow the same error when stop fails', async function () {
      const stopError = fake();
      const stopped = fake();
      const err = new Error('stop failed');
      gateway = new BullMqGateway({ connection, queue, handler });
      gateway.on(SERVICE_STOP_ERROR, stopError).on(SERVICE_STOPPED, stopped);
      await gateway.start();
      await settle();
      stub(Worker.prototype, 'close').rejects(err);

      await expect(gateway.stop()).to.be.rejectedWith(err);

      expect(stopError).to.have.been.calledOnceWithExactly(err);
      expect(stopped).to.not.have.been.called;
      restore();
      await gateway.stop();
    });

    it('should wrap a non-Error failure in the event and rethrow the original', async function () {
      const stopError = fake();
      gateway = new BullMqGateway({ connection, queue, handler });
      gateway.on(SERVICE_STOP_ERROR, stopError);
      await gateway.start();
      await settle();
      stub(Worker.prototype, 'close').callsFake(() => Promise.reject('boom'));

      await expect(gateway.stop()).to.be.rejected.and.eventually.equal('boom');

      expect(stopError).to.have.been.calledOnce;
      const [emitted] = stopError.firstCall.args;
      expect(emitted).to.be.instanceOf(Error);
      expect(emitted.message).to.equal('boom');
      expect(emitted.cause).to.equal('boom');
      restore();
      await gateway.stop();
    });

    it('should be startable and stoppable', function () {
      gateway = new BullMqGateway({ connection, queue, handler });

      expect(isStartable(gateway)).to.be.true;
      expect(isStoppable(gateway)).to.be.true;
    });

    it('should be managed by a ProcessManager', async function () {
      const started = fake();
      const stopped = fake();
      gateway = new BullMqGateway({ connection, queue, handler });
      gateway.on(SERVICE_STARTED, started).on(SERVICE_STOPPED, stopped);
      const manager = new ProcessManager({});
      manager.add(gateway);

      await manager.start();
      await settle();
      await manager.stop();

      expect(started).to.have.been.calledOnce;
      expect(stopped).to.have.been.calledOnce;
    });
  });
});
