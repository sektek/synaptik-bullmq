import {
  Component,
  OptionalProvider,
  OptionalProviderComponent,
  OptionalProviderFn,
  getComponent,
} from '@sektek/utility-belt';
import { Job, JobSchedulerJson, Queue } from 'bullmq';

import { JobProvider } from './job-provider.js';

/**
 * A job scheduler together with the job for its next run.
 */
export type RepeatableJobResult = {
  scheduler: JobSchedulerJson;
  /** `undefined` when the next job has already started or been removed. */
  nextJob?: Job;
};

/**
 * Options for {@link RepeatableJobProvider}.
 */
export type RepeatableJobProviderOptions = {
  /** The queue the job schedulers belong to. */
  queue: Queue;
  /** Fetches the next job by id. Defaults to a {@link JobProvider} on `queue`. */
  jobProvider?: OptionalProviderComponent<Job, string>;
};

/**
 * Retrieves a BullMQ job scheduler by id along with its next scheduled job.
 */
export class RepeatableJobProvider implements OptionalProvider<
  RepeatableJobResult,
  string
> {
  #queue: Queue;
  #jobProvider: OptionalProviderFn<Job, string>;

  constructor(opts: RepeatableJobProviderOptions) {
    this.#queue = opts.queue;
    this.#jobProvider = getComponent(opts.jobProvider, 'get', {
      name: 'jobProvider',
      default: new JobProvider({ queue: opts.queue }),
    });
  }

  /**
   * @param schedulerId - The id of the job scheduler.
   * @returns The scheduler and its next job, or `undefined` when no scheduler
   * has the given id.
   */
  async get(schedulerId: string): Promise<RepeatableJobResult | undefined> {
    const scheduler = await this.#queue.getJobScheduler(schedulerId);
    if (!scheduler) {
      return undefined;
    }

    if (scheduler.next === undefined) {
      return { scheduler };
    }

    const nextJob = await this.#jobProvider(
      `repeat:${schedulerId}:${scheduler.next}`,
    );

    return { scheduler, nextJob };
  }
}

/**
 * A {@link RepeatableJobProvider}, or a function with the same signature as
 * its `get` method.
 */
export type RepeatableJobProviderComponent = Component<
  RepeatableJobProvider,
  'get'
>;
