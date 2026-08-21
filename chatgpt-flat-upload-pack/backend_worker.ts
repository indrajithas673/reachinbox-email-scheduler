import { Worker, Job } from 'bullmq';
import redis from '../config/redis';
import prisma from '../database/prisma';
import { EMAIL_QUEUE_NAME } from './email.queue';
import { EmailDeliveryPayload } from './types/email.job.payload';
import { appConfig } from '../config/app';
import { CoordinationService } from './coordination.service';
import { SmtpService } from '../modules/emails/services/smtp.service';
import { SchedulingService } from '../modules/emails/services/scheduling.service';

export const emailWorker = new Worker<EmailDeliveryPayload>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailDeliveryPayload>) => {
    const { emailJobId } = job.data;

    console.log(`[Worker] Processing BullMQ Job ${job.id} for EmailJob ${emailJobId}`);

    const recoveryThresholdDate = new Date(Date.now() - appConfig.processingTimeoutMs);

    // Atomic claim. DELAYED_RATE_LIMIT is also claimable in case BullMQ retried a job
    // that we successfully updated to DELAYED_RATE_LIMIT in the DB but crashed before creating the new delayed job.
    const claimedJob = await prisma.emailJob.updateMany({
      where: {
        id: emailJobId,
        OR: [
          { status: 'SCHEDULED' },
          { status: 'DELAYED_RATE_LIMIT' },
          {
            status: 'PROCESSING',
            processingStartedAt: { lt: recoveryThresholdDate }
          }
        ]
      },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    if (claimedJob.count === 0) {
      const currentJob = await prisma.emailJob.findUnique({ where: { id: emailJobId } });
      
      if (!currentJob) {
        console.warn(`[Worker] EmailJob ${emailJobId} not found in database; skipping delivery`);
        return;
      }
      if (currentJob.status === 'SENT') {
        console.info(`[Worker] EmailJob ${emailJobId} already SENT; skipping delivery`);
        return;
      }
      if (currentJob.status === 'PROCESSING') {
        console.info(`[Worker] EmailJob ${emailJobId} is actively PROCESSING by another worker; skipping delivery`);
        return;
      }
      console.warn(`[Worker] EmailJob ${emailJobId} cannot be claimed (Status: ${currentJob.status}); skipping delivery`);
      return;
    }

    // Load full job and sender to get credentials
    const fullJob = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
      include: {
        batch: true,
        sender: true
      }
    });

    if (!fullJob) {
      return;
    }

    const { sender, batch, sequenceNumber } = fullJob;
    const now = Date.now();

    // IDEMPOTENCY / CRASH RECOVERY CHECK
    // If this job was previously rescheduled (DB says it's for the future), 
    // it means a worker crashed between updating the DB and creating the new BullMQ delayed job.
    // Or BullMQ retried the original job.
    // We just recreate the delayed job safely using deterministic ID and return cleanly.
    if (fullJob.scheduledTime.getTime() > now) {
      console.log(`[Worker] EmailJob ${emailJobId} is scheduled for future (${fullJob.scheduledTime.toISOString()}). Recovering missing delayed queue job.`);
      
      // We must reset status to whatever it was meant to be, based on how far in the future it is.
      // But actually, just setting to SCHEDULED is fine for organic recovery.
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { status: 'SCHEDULED' }
      });
      await SchedulingService.scheduleEmailJob(emailJobId);
      return; // Return cleanly so the active BullMQ job completes
    }

    // Coordinate Distributed Rate Limits & Minimum Delay
    const coordinationResult = await CoordinationService.tryReserveSendSlot(
      sender.id,
      batch.hourlyLimit,
      batch.delayMs 
    );

    if (coordinationResult.status === 'DELAY_REQUIRED') {
      // Use sequenceNumber to stagger identical future timestamps slightly, preserving deterministic order
      const orderedFutureMs = coordinationResult.nextAllowedAt + (sequenceNumber * 5);
      const scheduledTime = new Date(orderedFutureMs);
      
      console.log(`[Worker] EmailJob ${emailJobId} requires delay. Rescheduling to ${scheduledTime.toISOString()}`);
      
      // Update DB safely before scheduling
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SCHEDULED',
          scheduledTime
        }
      });
      
      // Reschedule via BullMQ
      await SchedulingService.scheduleEmailJob(emailJobId);
      return; // Release worker
    }

    if (coordinationResult.status === 'RATE_LIMITED') {
      // Order preservation for rate limit boundary: jobs pushed to next hour are staggered 
      // by sequenceNumber so they become active in BullMQ sequentially.
      const orderedFutureMs = coordinationResult.nextHourMs + (sequenceNumber * 5);
      const scheduledTime = new Date(orderedFutureMs);

      console.log(`[Worker] EmailJob ${emailJobId} hit hourly rate limit. Rescheduling to next hour ${scheduledTime.toISOString()}`);
      
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'DELAYED_RATE_LIMIT',
          scheduledTime
        }
      });
      
      await SchedulingService.scheduleEmailJob(emailJobId);
      return; // Release worker
    }

    // Status is OK, we have reserved the slot.
    console.log(`[Worker] EmailJob ${emailJobId} slot reserved. Attempting SMTP delivery.`);

    try {
      // Execute SMTP delivery
      const info = await SmtpService.sendEmail(fullJob, sender, batch.subject, batch.body);

      // On success, mark SENT
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SENT',
          actualSentTime: new Date(),
        }
      });

      console.log(`[Worker] Successfully sent and updated EmailJob ${emailJobId}.`);
    } catch (error: any) {
      console.error(`[Worker] SMTP delivery failed for EmailJob ${emailJobId}:`, error.message);
      
      // Update DB with failure reason. We keep the rate-limit slot consumed (intentional trade-off).
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SCHEDULED',
          failureReason: error.message
        }
      });

      // Throw error so BullMQ triggers retry policy (exponential backoff)
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: appConfig.workerConcurrency,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`[Worker] BullMQ Job ${job.id} has completed safely!`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Worker] BullMQ Job ${job?.id} has failed with ${err.message}`);
});
