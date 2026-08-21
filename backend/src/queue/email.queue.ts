import { Queue } from 'bullmq';
import redis from '../config/redis';
import { EmailDeliveryPayload } from './types/email.job.payload';

export const EMAIL_QUEUE_NAME = 'email-delivery-queue';

export const emailQueue = new Queue<EmailDeliveryPayload>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
