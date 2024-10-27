import { ConnectionOptions, Queue } from 'bullmq';
import { EventServiceOptions } from '@sektek/synaptik';

export type BullMqServiceOptions = EventServiceOptions & {
  queue?: Queue;
  queueName?: string;
  connection?: ConnectionOptions;
  blockingConnection?: boolean;
};
