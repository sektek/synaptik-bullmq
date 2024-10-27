import { Component } from '@sektek/utility-belt';
import { Event } from '@sektek/synaptik';

export type JobNameBuilderFn<T extends Event = Event> = (
  event: T,
) => string | PromiseLike<string>;

export interface JobNameBuilder<T extends Event = Event> {
  create: JobNameBuilderFn<T>;
}

export type JobNameBuilderComponent<T extends Event = Event> = Component<
  JobNameBuilder<T>,
  'create'
>;
