import {
  AbstractEventService,
  Event,
  EventServiceOptions,
} from '@sektek/synaptik';
import { Queue } from 'bullmq';

import {
  JobNameBuilderFn,
  JobsOptionsProviderComponent,
  JobsOptionsProviderFn,
} from './types/index.js';
import { getComponent } from '@sektek/utility-belt/index.js';

export type BullMqChannelOptions<T extends Event = Event> =
  EventServiceOptions & {
    queue: Queue;
    jobNameBuilder: JobNameBuilderFn<T>;
    jobsOptionsProvider?: JobsOptionsProviderComponent<T>;
  };

const DEFAULT_JOB_NAME_BUILDER: JobNameBuilderFn = event => event.id;

const DEFAULT_JOBS_OPTIONS_PROVIDER: JobsOptionsProviderFn = jobName => ({
  jobId: jobName,
});

export class BullMqChannel<
  T extends Event = Event,
> extends AbstractEventService {
  #queue: Queue;
  #jobNameBuilder: JobNameBuilderFn<T>;
  #jobsOptionsProvider: JobsOptionsProviderFn<T>;

  constructor(opts: BullMqChannelOptions) {
    super(opts);
    this.#queue = opts.queue;
    this.#jobNameBuilder = getComponent(
      opts.jobNameBuilder,
      'create',
      DEFAULT_JOB_NAME_BUILDER,
    );
    this.#jobsOptionsProvider = getComponent(
      opts.jobsOptionsProvider,
      'get',
      DEFAULT_JOBS_OPTIONS_PROVIDER,
    );
  }

  async send(event: T) {
    this.emit('event:received', event);
    try {
      const jobName = await this.#jobNameBuilder(event);
      await this.#queue.add(
        jobName,
        event,
        await this.#jobsOptionsProvider(jobName, event),
      );
      this.emit('event:delivered', event);
    } catch (err) {
      this.emit('event:error', event, err);
    }
  }
}
