import {
  AbstractEventComponent,
  EVENT_ERROR,
  EVENT_PROCESSED,
  EVENT_RECEIVED,
  Event,
  EventEndpointComponent,
  EventHandlerEvents,
  EventHandlerFn,
  getEventHandlerComponent,
} from '@sektek/synaptik';
import { ConnectionOptions, Job, Worker, WorkerOptions } from 'bullmq';
import {
  ErrorHandlerFn,
  EventEmittingService,
  SERVICE_STARTED,
  SERVICE_START_ERROR,
  SERVICE_STOPPED,
  SERVICE_STOP_ERROR,
  ServiceEvents,
  getComponent,
  toError,
} from '@sektek/utility-belt';

import {
  JobEventExtractorComponent,
  JobEventExtractorFn,
} from './types/job-event-extractor.js';
import { BullMqServiceOptions } from './types/index.js';

const DEFAULT_CONNECTION = {
  host: 'localhost',
  port: 6379,
};

const DEFAULT_JOB_EVENT_EXTRACTOR = (job: Job) => job.data as Event;

type BullMqGatewayOptions<T extends Event = Event> = BullMqServiceOptions & {
  handler: EventEndpointComponent<T>;
  eventExtractor?: JobEventExtractorComponent<T>;
  workerOptions?: Omit<WorkerOptions, 'connection'>;
};

/**
 * Events emitted by a {@link BullMqGateway}.
 *
 * - `event:received`, `event:processed`, `event:error`: the standard handler
 *   events.
 * - `job:received`, `job:completed`, `job:error`: BullMQ job events.
 * - `service:started`, `service:startError`: outcome of `start()`.
 * - `service:stopped`, `service:stopError`: outcome of `stop()`.
 *
 * @template T The event type handled by the gateway.
 */
export type BullMqGatewayEvents<T extends Event = Event> =
  EventHandlerEvents<T> &
    ServiceEvents & {
      'job:received': (job: Job) => void;
      'job:completed': (job: Job) => void;
      'job:error': ErrorHandlerFn<Job>;
    };

/**
 * A gateway that consumes BullMQ jobs from a queue and dispatches them as
 * events to a handler.
 *
 * Emits the `Service` lifecycle events; see `start()` and `stop()`. When
 * `start()` or `stop()` fails, only the matching `service:*Error` event is
 * emitted, and a thrown value that is not an `Error` is wrapped in one. Event
 * listeners are called synchronously and their exceptions are not isolated;
 * an exception thrown by a listener propagates to the caller of `start()` or
 * `stop()`.
 *
 * @template T The event type handled by this gateway.
 */
export class BullMqGateway<T extends Event = Event>
  extends AbstractEventComponent
  implements EventEmittingService<BullMqGatewayEvents<T>>
{
  #handler: EventHandlerFn<T>;
  #queueName: string;
  #connection: ConnectionOptions;
  #blockingConnection?: boolean;
  #eventExtractor: JobEventExtractorFn<T>;
  #worker?: Worker;
  #workerOptions?: Omit<WorkerOptions, 'connection'>;

  constructor(opts: BullMqGatewayOptions) {
    super(opts);

    this.#handler = getEventHandlerComponent(opts.handler);
    this.#eventExtractor = getComponent(opts.eventExtractor, 'extract', {
      name: 'eventExtractor',
      default: DEFAULT_JOB_EVENT_EXTRACTOR,
    });
    this.#connection = opts.connection || DEFAULT_CONNECTION;
    this.#blockingConnection = opts.blockingConnection;
    this.#workerOptions = opts.workerOptions;

    if (!opts.queue && !opts.queueName) {
      throw new Error('Queue or queueName are required');
    }

    this.#queueName = opts.queueName ?? opts.queue?.name ?? 'default';
  }

  /**
   * Creates the BullMQ worker and registers `stop` for `SIGINT` and
   * `SIGTERM`.
   *
   * Emits `service:started` after the worker is created. If starting throws,
   * emits only `service:startError` with the thrown value as an `Error` and
   * rethrows the original value. A non-`Error` value is wrapped in an `Error`
   * whose `cause` is the original value.
   *
   * Each call creates a new worker and replaces the reference to the previous
   * one, and emits `service:started` again.
   */
  async start() {
    try {
      this.#startWorker();
    } catch (err) {
      this.emit(SERVICE_START_ERROR, toError(err));
      throw err;
    }

    this.emit(SERVICE_STARTED);
  }

  #startWorker() {
    this.#worker = new Worker(
      this.#queueName,
      async job => {
        this.emit('job:received', job);
        const event = await this.#eventExtractor(job);
        this.emit(EVENT_RECEIVED, event);

        try {
          const result = await this.#handler(event);
          this.emit(EVENT_PROCESSED, event, result);
        } catch (err) {
          this.emit(EVENT_ERROR, err, event);
          throw err;
        }
      },
      {
        ...this.#workerOptions,
        connection: this.#connection,
        ...(this.#blockingConnection !== undefined && {
          blockingConnection: this.#blockingConnection,
        }),
      },
    );

    this.#worker.on('completed', (job: Job) => {
      this.emit('job:completed', job);
    });

    this.#worker.on('failed', (job: Job, err: Error) => {
      this.emit('job:error', err, job);
    });

    process.on('SIGINT', this.stop.bind(this));
    process.on('SIGTERM', this.stop.bind(this));
  }

  /**
   * Closes the BullMQ worker, waiting for in-flight jobs to finish.
   *
   * Emits `service:stopped` after the worker is closed. If closing throws,
   * emits only `service:stopError` with the thrown value as an `Error` and
   * rethrows the original value. A non-`Error` value is wrapped in an `Error`
   * whose `cause` is the original value.
   *
   * When the gateway has not been started, there is no worker to close and
   * `stop()` still emits `service:stopped`.
   */
  async stop() {
    try {
      if (this.#worker) {
        await this.#worker.close();
      }
    } catch (err) {
      this.emit(SERVICE_STOP_ERROR, toError(err));
      throw err;
    }

    this.emit(SERVICE_STOPPED);
  }
}
