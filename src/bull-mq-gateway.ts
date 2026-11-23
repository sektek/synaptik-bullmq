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
  isError,
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
 * **Lifecycle events** — `start()` and `stop()` emit `service:started` and
 * `service:stopped` on success. On failure only the matching
 * `service:startError` or `service:stopError` event is emitted, carrying an
 * `Error`, and the original thrown value is rethrown unchanged.
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
   * Starts the BullMQ worker.
   *
   * Emits `service:started` once the worker is created. If starting fails,
   * emits `service:startError` and rethrows.
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

  /**
   * Closes the BullMQ worker, waiting for in-flight jobs to finish.
   *
   * Emits `service:stopped` once the worker is closed. If stopping fails,
   * emits `service:stopError` and rethrows.
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
}

/**
 * Normalizes a thrown value to an `Error` for lifecycle error events.
 *
 * @param thrown - The value that was thrown.
 * @returns `thrown` if it is an `Error`, otherwise an `Error` wrapping it as `cause`.
 */
function toError(thrown: unknown): Error {
  return isError(thrown)
    ? thrown
    : new Error(String(thrown), { cause: thrown });
}
