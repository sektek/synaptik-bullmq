import { Job, Queue } from 'bullmq';
import {
  Provider,
  ProviderFn,
  ResourceNotFoundError,
  getComponent,
} from '@sektek/utility-belt';

import { JobProvider, JobProviderComponent } from './job-provider.js';

/**
 * Options for {@link RepeatableJobProvider}.
 */
export type RepeatableJobProviderOptions = {
  /** The queue the job schedulers belong to. */
  queue: Queue;
  /** Fetches the next job by id. Defaults to a {@link JobProvider} on `queue`. */
  jobProvider?: JobProviderComponent;
};

/**
 * Retrieves the next scheduled job of a BullMQ job scheduler by the
 * scheduler's id. The job carries the scheduler's definition in
 * `job.repeatJobKey` and `job.opts.repeat`.
 *
 * The job is returned in whatever state it is in; it may already be `active`
 * while the scheduler prepares its next run. Call `job.getState()` to find out.
 */
export class RepeatableJobProvider implements Provider<Job, string> {
  #queue: Queue;
  #jobProvider: ProviderFn<Job, string>;

  constructor(opts: RepeatableJobProviderOptions) {
    this.#queue = opts.queue;
    this.#jobProvider = getComponent(opts.jobProvider, 'get', {
      name: 'jobProvider',
      default: new JobProvider({ queue: opts.queue }),
    });
  }

  /**
   * @param schedulerId - The id of the job scheduler.
   * @returns The scheduler's next job.
   * @throws {ResourceNotFoundError} When no scheduler has the given id, or the
   * scheduler's next job no longer exists (it has been removed or the
   * scheduler has reached its limit).
   */
  async get(schedulerId: string): Promise<Job> {
    const scheduler = await this.#queue.getJobScheduler(schedulerId);
    if (!scheduler) {
      throw new ResourceNotFoundError({
        resource: 'JobScheduler',
        id: schedulerId,
      });
    }

    if (scheduler.next === undefined) {
      throw new ResourceNotFoundError({
        resource: 'Job',
        id: schedulerId,
        message: `JobScheduler has no next job: ${schedulerId}`,
      });
    }

    const id = `repeat:${schedulerId}:${scheduler.next}`;

    return this.#jobProvider(id);
  }
}
