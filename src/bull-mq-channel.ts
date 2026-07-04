import {
  AbstractEventComponent,
  EVENT_DELIVERED,
  EVENT_ERROR,
  EVENT_RECEIVED,
  Event,
  EventComponentOptions,
} from '@sektek/synaptik';
import { JobsOptions, Queue } from 'bullmq';

import {
  JobNameProviderComponent,
  JobNameProviderFn,
  JobsOptionsProviderComponent,
  JobsOptionsProviderFn,
} from './types/index.js';
import { getComponent } from '@sektek/utility-belt';

export type BullMqChannelOptions<T extends Event = Event> =
  EventComponentOptions & {
    queue: Queue;
    jobNameProvider?: JobNameProviderComponent<T>;
    jobsOptionsProvider?: JobsOptionsProviderComponent<T>;
  };

const DEFAULT_JOB_NAME_PROVIDER: JobNameProviderFn = event => event.id;

const DEFAULT_JOBS_OPTIONS_PROVIDER: JobsOptionsProviderFn = (
  _event,
  jobName,
  options = {},
) => ({
  ...options,
  jobId: jobName,
});

export class BullMqChannel<
  T extends Event = Event,
> extends AbstractEventComponent {
  #queue: Queue;
  #jobNameProvider: JobNameProviderFn<T>;
  #jobsOptionsProvider: JobsOptionsProviderFn<T>;

  constructor(opts: BullMqChannelOptions) {
    super(opts);
    this.#queue = opts.queue;
    this.#jobNameProvider = getComponent(opts.jobNameProvider, 'get', {
      name: 'jobNameProvider',
      default: DEFAULT_JOB_NAME_PROVIDER,
    });
    this.#jobsOptionsProvider = getComponent(opts.jobsOptionsProvider, 'get', {
      name: 'jobsOptionsProvider',
      default: DEFAULT_JOBS_OPTIONS_PROVIDER,
    });
  }

  async send(event: T, options?: JobsOptions) {
    this.emit(EVENT_RECEIVED, event);
    try {
      const jobName = await this.#jobNameProvider(event);
      const job = await this.#queue.add(
        jobName,
        event,
        await this.#jobsOptionsProvider(event, jobName, options),
      );
      this.emit(EVENT_DELIVERED, event);
      this.emit('job:created', job);
    } catch (err) {
      this.emit(EVENT_ERROR, err, event);
      throw err;
    }
  }
}
