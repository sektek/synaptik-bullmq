import { Component } from '@sektek/utility-belt';
import { Event } from '@sektek/synaptik';
import { Job } from 'bullmq';

export type JobEventExtractorFn<T extends Event = Event> = (
  job: Job,
) => T | PromiseLike<T>;

export interface JobEventExtractor<T extends Event = Event> {
  extract: JobEventExtractorFn<T>;
}

export type JobEventExtractorComponent<T extends Event = Event> = Component<
  JobEventExtractor<T>,
  'extract'
>;
