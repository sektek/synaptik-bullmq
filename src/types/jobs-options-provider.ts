import { Component } from '@sektek/utility-belt/index.js';
import { Event } from '@sektek/synaptik';
import { JobsOptions } from 'bullmq';

import { BullMqChannelSendOptions } from './bull-mq-channel-send-options.js';

export type JobsOptionsProviderFn<T extends Event = Event> = (
  event: T,
  options?: BullMqChannelSendOptions,
) => JobsOptions | PromiseLike<JobsOptions>;

export interface JobsOptionsProvider<T extends Event = Event> {
  get: JobsOptionsProviderFn<T>;
}

export type JobsOptionsProviderComponent<T extends Event = Event> = Component<
  JobsOptionsProvider<T>,
  'get'
>;
