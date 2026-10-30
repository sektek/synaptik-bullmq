import { Component, OptionalProvider } from '@sektek/utility-belt';
import { Job, Queue } from 'bullmq';

/**
 * Options for {@link JobProvider}.
 */
export type JobProviderOptions = {
  /** The queue to look jobs up on. */
  queue: Queue;
};

/**
 * Retrieves a BullMQ job by its id from a queue.
 */
export class JobProvider implements OptionalProvider<Job, string> {
  #queue: Queue;

  constructor(opts: JobProviderOptions) {
    this.#queue = opts.queue;
  }

  /**
   * @param id - The id of the job to retrieve.
   * @returns The job, or `undefined` when no job has the given id.
   */
  async get(id: string): Promise<Job | undefined> {
    return this.#queue.getJob(id);
  }
}

/**
 * A {@link JobProvider}, or a function with the same signature as its `get`
 * method.
 */
export type JobProviderComponent = Component<JobProvider, 'get'>;
