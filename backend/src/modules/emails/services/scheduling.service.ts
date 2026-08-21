import { emailQueue } from '../../../queue/email.queue';
import prisma from '../../../database/prisma';

export class SchedulingService {
  /**
   * Schedules an existing persistent EmailJob into BullMQ.
   * If the scheduled time is in the past, it gets 0 delay and is eligible immediately.
   */
  static async scheduleEmailJob(emailJobId: string): Promise<void> {
    const emailJob = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
    });

    if (!emailJob) {
      throw new Error(`EmailJob with id ${emailJobId} not found.`);
    }

    if (emailJob.status !== 'SCHEDULED') {
      throw new Error(`EmailJob ${emailJobId} cannot be scheduled because its status is ${emailJob.status}.`);
    }

    // Calculate delay if scheduled time is in the future
    const now = Date.now();
    const delay = Math.max(0, emailJob.scheduledTime.getTime() - now);

    // Deterministic Job ID to prevent duplicate delayed jobs
    const jobId = `emailjob-${emailJob.id}-${emailJob.scheduledTime.getTime()}`;

    // Add to BullMQ
    const bullJob = await emailQueue.add(
      'deliver-email',
      { emailJobId: emailJob.id },
      { 
        delay,
        jobId // Deterministic identity
      }
    );

    // Sync BullMQ job ID back to PostgreSQL
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { bullMqJobId: bullJob.id },
    });

    console.log(`[Scheduler] Scheduled EmailJob ${emailJob.id} with BullMQ Job ID ${bullJob.id}. Delay: ${delay}ms`);
  }
}
