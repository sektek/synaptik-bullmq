import {
  AbstractEventService,
  Event,
  EventEndpointComponent,
  EventHandlerFn,
  getEventHandlerComponent,
} from '@sektek/synaptik';
import { ConnectionOptions, Job, Worker, WorkerOptions } from 'bullmq';
import _ from 'lodash';

import {
  JobEventExtractorComponent,
  JobEventExtractorFn,
} from './types/job-event-extractor.js';
import { BullMqServiceOptions } from './types/index.js';
import { getComponent } from '@sektek/utility-belt/index.js';

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

interface BullMqGatewayEvents<T extends Event = Event> {
  'event:received': (event: T) => void;
  'event:processed': (event: T) => void;
  'event:error': (event: T, err: Error) => void;
  'job:received': (job: Job) => void;
  'job:completed': (job: Job) => void;
  'job:error': (job: Job, err: Error) => void;
}

interface Gateway<T extends Event = Event> {
  on<E extends keyof BullMqGatewayEvents<T>>(
    event: E,
    listener: BullMqGatewayEvents<T>[E],
  ): this;
  emit<E extends keyof BullMqGatewayEvents<T>>(
    event: E,
    ...args: Parameters<BullMqGatewayEvents<T>[E]>
  ): boolean;
}

export class BullMqGateway<T extends Event = Event>
  extends AbstractEventService
  implements Gateway<T>
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

    if (!opts.queue || !opts.queueName) {
      throw new Error('Queue or queueName are required');
    }

    this.#queueName = opts.queueName || opts.queue.name;
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
  }
}
