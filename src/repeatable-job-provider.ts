import { Job, JobSchedulerJson, Queue } from 'bullmq';
import {
  OptionalProvider,
  Provider,
  ProviderComponent,
  ProviderFn,
  ResourceNotFoundError,
  getComponent,
  optional,
} from '@sektek/utility-belt';

import { JobProvider, JobProviderComponent } from './job-provider.js';

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
  /**
   * Fetches the next job by id. A `ResourceNotFoundError` from it leaves
   * `nextJob` undefined. Defaults to a {@link JobProvider} on `queue`.
   */
  jobProvider?: JobProviderComponent;
};

/**
 * Retrieves a BullMQ job scheduler by id along with its next scheduled job.
 */
export class RepeatableJobProvider implements Provider<
  RepeatableJobResult,
  string
> {
  #queue: Queue;
  #jobProvider: OptionalProvider<Job, string>;

  constructor(opts: RepeatableJobProviderOptions) {
    this.#queue = opts.queue;
    const jobProvider: ProviderFn<Job, string> = getComponent(
      opts.jobProvider,
      'get',
      {
        name: 'jobProvider',
        default: new JobProvider({ queue: opts.queue }),
      },
    );

    this.#jobProvider = optional(jobProvider);
  }

  /**
   * @param schedulerId - The id of the job scheduler.
   * @returns The scheduler and its next job.
   * @throws {ResourceNotFoundError} When no scheduler has the given id.
   */
  async get(schedulerId: string): Promise<RepeatableJobResult> {
    const scheduler = await this.#queue.getJobScheduler(schedulerId);
    if (!scheduler) {
      throw new ResourceNotFoundError({
        resource: 'JobScheduler',
        id: schedulerId,
      });
    }

    if (scheduler.next === undefined) {
      return { scheduler };
    }

    const nextJob = await this.#jobProvider.get(
      `repeat:${schedulerId}:${scheduler.next}`,
    );

    return { scheduler, nextJob };
  }
}

/**
 * A {@link RepeatableJobProvider}, or a function with the same signature as
 * its `get` method.
 */
export type RepeatableJobProviderComponent = ProviderComponent<
  RepeatableJobResult,
  string
>;
