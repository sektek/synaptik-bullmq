import { ConnectionOptions, Queue } from 'bullmq';
import { EventComponentOptions } from '@sektek/synaptik';

export type BullMqServiceOptions = EventComponentOptions & {
  queue?: Queue;
  queueName?: string;
  connection?: ConnectionOptions;
  blockingConnection?: boolean;
};
