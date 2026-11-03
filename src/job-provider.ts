import { Job, Queue } from 'bullmq';
import {
  Provider,
  ProviderComponent,
  ResourceNotFoundError,
} from '@sektek/utility-belt';

/**
 * Options for {@link JobProvider}.
 */
export type JobProviderOptions = {
  /** The queue to look jobs up on. */
  queue: Queue;
};

/**
 * Retrieves a BullMQ job by its id from a queue. Wrap it with `optional()` from
 * `@sektek/utility-belt` to get `undefined` instead of an error for an unknown
 * id.
 */
export class JobProvider implements Provider<Job, string> {
  #queue: Queue;

  constructor(opts: JobProviderOptions) {
    this.#queue = opts.queue;
  }

  /**
   * @param id - The id of the job to retrieve.
   * @returns The job.
   * @throws {ResourceNotFoundError} When no job has the given id.
   */
  async get(id: string): Promise<Job> {
    const job = await this.#queue.getJob(id);

    if (job === undefined) {
      throw new ResourceNotFoundError({ resource: 'Job', id });
    }

    return job;
  }
}

/**
 * A {@link JobProvider}, or a function with the same signature as its `get`
 * method.
 */
export type JobProviderComponent = ProviderComponent<Job, string>;
