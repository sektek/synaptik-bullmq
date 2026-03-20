import { EventChannelSendOptions } from '@sektek/synaptik';
import { JobsOptions } from 'bullmq';

export type BullMqChannelSendOptions = EventChannelSendOptions &
  JobsOptions & {
    jobName?: string;
  };
