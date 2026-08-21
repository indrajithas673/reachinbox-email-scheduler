import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import prisma from '../../database/prisma';
import { z } from 'zod';
import { appConfig } from '../../config/app';
import { SchedulingService } from './services/scheduling.service';

const router = Router();
router.use(requireAuth);

const scheduleSchema = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(10000),
  recipients: z.array(z.string().email()).min(1),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid ISO timestamp" }),
  delayMs: z.number().int().nonnegative().min(appConfig.minEmailDelayMs),
  hourlyLimit: z.number().int().positive().max(appConfig.maxEmailsPerHour),
  senderId: z.string().uuid(),
});

// GET /api/emails/scheduled
router.get('/scheduled', async (req, res) => {
  try {
    const jobs = await prisma.emailJob.findMany({
      where: {
        batch: { userId: req.user!.id },
        status: { in: ['SCHEDULED', 'PROCESSING', 'DELAYED_RATE_LIMIT'] }
      },
      select: {
        id: true,
        recipientEmail: true,
        batch: { select: { subject: true } },
        scheduledTime: true,
        status: true,
        sequenceNumber: true
      },
      orderBy: [
        { scheduledTime: 'asc' },
        { sequenceNumber: 'asc' }
      ]
    });
    res.json(jobs.map(j => ({ ...j, subject: j.batch.subject, batch: undefined })));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emails/sent
router.get('/sent', async (req, res) => {
  try {
    const jobs = await prisma.emailJob.findMany({
      where: {
        batch: { userId: req.user!.id },
        status: { in: ['SENT', 'FAILED'] }
      },
      select: {
        id: true,
        recipientEmail: true,
        batch: { select: { subject: true } },
        actualSentTime: true,
        status: true,
      },
      orderBy: { actualSentTime: 'desc' }
    });
    res.json(jobs.map(j => ({ ...j, subject: j.batch.subject, batch: undefined })));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emails/:id
router.get('/:id', async (req, res) => {
  try {
    const job = await prisma.emailJob.findFirst({
      where: {
        id: req.params.id,
        batch: { userId: req.user!.id }
      },
      include: {
        sender: {
          select: { senderEmail: true, displayName: true } // omit passwords
        }
      }
    });

    if (!job) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/emails/schedule
router.post('/schedule', async (req, res) => {
  try {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request payload', details: parsed.error.issues });
    }

    const { subject, body, recipients, startTime, delayMs, hourlyLimit, senderId } = parsed.data;

    // Verify sender ownership
    const sender = await prisma.sender.findFirst({
      where: { id: senderId, userId: req.user!.id }
    });
    if (!sender) {
      return res.status(403).json({ error: 'Forbidden: Sender not found or unowned' });
    }

    // Deduplicate recipients cleanly
    const uniqueRecipients = Array.from(new Set(recipients));

    // Create DB Transaction
    const batch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.emailBatch.create({
        data: {
          userId: req.user!.id,
          senderId,
          subject,
          body,
          startTime: new Date(startTime),
          delayMs,
          hourlyLimit
        }
      });

      const start = createdBatch.startTime.getTime();
      const jobData = uniqueRecipients.map((email, index) => {
        const sequenceNumber = index + 1;
        const jobScheduledTime = new Date(start + ((sequenceNumber - 1) * delayMs));
        
        return {
          batchId: createdBatch.id,
          senderId,
          recipientEmail: email,
          sequenceNumber,
          scheduledTime: jobScheduledTime,
          status: 'SCHEDULED' as const,
          queuePublished: false, // Explicit publication state
          idempotencyKey: `schedule-${createdBatch.id}-${sequenceNumber}`
        };
      });

      await tx.emailJob.createMany({ data: jobData });

      return createdBatch;
    });

    // Fetch the created jobs so we can schedule them
    const jobs = await prisma.emailJob.findMany({
      where: { batchId: batch.id }
    });

    // Enqueue each job. We iterate natively and safely handle any BullMQ failures.
    let publishFailures = 0;
    for (const job of jobs) {
      try {
        await SchedulingService.scheduleEmailJob(job.id);
        
        // Update publication state
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { queuePublished: true }
        });
      } catch (err) {
        console.error(`[API] Failed to publish initial BullMQ job for EmailJob ${job.id}`, err);
        publishFailures++;
      }
    }

    if (publishFailures > 0) {
      // 500 error because the queue is experiencing issues. The db state is safe (queuePublished = false)
      // and normal recovery will pick them up later.
      return res.status(500).json({
        error: 'Scheduling partially failed due to queue unavailability. Persisted intent remains recoverable.',
        batchId: batch.id,
        total: jobs.length,
        failed: publishFailures
      });
    }

    res.status(201).json({ message: 'Successfully scheduled', batchId: batch.id, count: jobs.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
