import {
  AbstractEventService,
  Event,
  EventEndpointComponent,
  EventHandlerFn,
  getEventHandlerComponent,
} from '@sektek/synaptik';
import { ConnectionOptions, Job, Worker, WorkerOptions } from 'bullmq';
import { EventEmittingService, getComponent } from '@sektek/utility-belt';
import _ from 'lodash';

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

type BullMqGatewayEvents<T extends Event = Event> = {
  'event:received': (event: T) => void;
  'event:processed': (event: T) => void;
  'event:error': (event: T, err: Error) => void;
  'job:received': (job: Job) => void;
  'job:completed': (job: Job) => void;
  'job:error': (job: Job, err: Error) => void;
};

export class BullMqGateway<T extends Event = Event>
  extends AbstractEventService
  implements EventEmittingService<BullMqGatewayEvents<T>>
{
  #handler: EventHandlerFn<T>;
  #queueName: string;
  #connection: ConnectionOptions;
  #eventExtractor: JobEventExtractorFn<T>;
  #worker?: Worker;
  #workerOptions?: Omit<WorkerOptions, 'connection'>;

  constructor(opts: BullMqGatewayOptions) {
    super(opts);

    this.#handler = getEventHandlerComponent(opts.handler);
    this.#eventExtractor = getComponent(
      opts.eventExtractor,
      'extract',
      DEFAULT_JOB_EVENT_EXTRACTOR,
    );
    this.#connection = opts.connection || DEFAULT_CONNECTION;

    if (!opts.queue && !opts.queueName) {
      throw new Error('Queue or queueName are required');
    }

    this.#queueName = opts.queueName ?? opts.queue?.name ?? 'default';
  }

  async start() {
    this.#worker = new Worker(
      this.#queueName,
      async job => {
        this.emit('job:received', job);
        const event = await this.#eventExtractor(job);
        this.emit('event:received', event);

        try {
          const result = await this.#handler(event);
          this.emit('event:processed', event, result);
        } catch (err) {
          this.emit('event:error', event, err);
          throw err;
        }
      },
      _.merge({}, this.#workerOptions, { connection: this.#connection }),
    );

    this.#worker.on('completed', (job: Job) => {
      this.emit('job:completed', job);
    });

    this.#worker.on('failed', (job: Job, err: Error) => {
      this.emit('job:error', job, err);
    });

    process.on('SIGINT', this.shutdown.bind(this));
    process.on('SIGTERM', this.shutdown.bind(this));
  }

  async shutdown() {
    if (this.#worker) {
      await this.#worker.close();
    }
  }
}
