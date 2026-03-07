import {
  Event,
  EventBasedStringProvider,
  EventBasedStringProviderComponent,
  EventBasedStringProviderFn,
} from '@sektek/synaptik';

export type JobNameProviderFn<T extends Event = Event> =
  EventBasedStringProviderFn<T>;

export interface JobNameProvider<
  T extends Event = Event,
> extends EventBasedStringProvider<T> {}

export type JobNameProviderComponent<T extends Event = Event> =
  EventBasedStringProviderComponent<T>;
