import {
  Event,
  EventBasedProvider,
  EventBasedProviderComponent,
  EventBasedProviderFn,
} from '@sektek/synaptik';

export type JobNameProviderFn<T extends Event = Event> = EventBasedProviderFn<
  T,
  string
>;

export interface JobNameProvider<T extends Event = Event>
  extends EventBasedProvider<T, string> {}

export type JobNameProviderComponent<T extends Event = Event> =
  EventBasedProviderComponent<T, string>;
