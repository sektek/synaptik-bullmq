import { Component } from '@sektek/utility-belt/index.js';
import { Event } from '@sektek/synaptik';
import { JobsOptions } from 'bullmq';

export type JobsOptionsProviderFn<T extends Event = Event> = (
  event: T,
  jobName?: string,
) => JobsOptions | PromiseLike<JobsOptions>;

export interface JobsOptionsProvider<T extends Event = Event> {
  get: JobsOptionsProviderFn<T>;
}

export type JobsOptionsProviderComponent<T extends Event = Event> = Component<
  JobsOptionsProvider<T>,
  'get'
>;
