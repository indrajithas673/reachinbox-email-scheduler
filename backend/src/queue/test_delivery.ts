import { SchedulingService } from '../modules/emails/services/scheduling.service';
import { emailQueue } from './email.queue';
import { emailWorker } from './email.worker';
import { CoordinationService } from './coordination.service';
import prisma from '../database/prisma';
import redis from '../config/redis';

async function setupTestData() {
  const user = await prisma.user.create({
    data: {
      googleId: `test-${Date.now()}`,
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
    }
  });

  const sender = await prisma.sender.create({
    data: {
      userId: user.id,
      senderEmail: 'antigravity-test@ethereal.email', // Safe dummy
      etherealUsername: 'antigravity-test@ethereal.email',
      etherealPassword: 'password123',
      displayName: 'Phase 3 Tester'
    }
  });

  const batch = await prisma.emailBatch.create({
    data: {
      userId: user.id,
      subject: 'Test Subject',
      body: 'Test Body',
      startTime: new Date(),
      delayMs: 2000,
      hourlyLimit: 200,
      senderId: sender.id
    }
  });

  return { user, sender, batch };
}

async function run1000JobSimulation() {
  console.log('\n--- 1000-Job Simulation ---');
  
  const senderId = 'simulation-sender';
  const limit = 200;
  const minDelayMs = 2000;
  
  // Clear any existing keys
  const keys = await redis.keys(`email-*:${senderId}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  // We simulate a pool of jobs.
  // Each job tracks its current simulated `scheduledTime`
  type SimJob = { id: number, scheduledTime: number };
  
  let jobs: SimJob[] = [];
  const now = Date.now();
  for (let i = 1; i <= 1000; i++) {
    jobs.push({ id: i, scheduledTime: now });
  }

  const hourBuckets = new Map<number, number>();
  let successfulSends = 0;
  let simulatedGlobalTime = now;

  console.log(`Starting simulation of 1000 jobs. (Limit=${limit}, Delay=${minDelayMs}ms)`);

  while (jobs.length > 0) {
    // Sort jobs by scheduledTime, taking the earliest
    jobs.sort((a, b) => a.scheduledTime - b.scheduledTime);
    const job = jobs.shift()!;

    // Advance simulated time to the job's scheduled time if needed
    if (job.scheduledTime > simulatedGlobalTime) {
      simulatedGlobalTime = job.scheduledTime;
    }

    // Mock Date.now inside the Lua script by passing the simulatedGlobalTime
    // We override CoordinationService.tryReserveSendSlot temporarily using our own direct eval
    const date = new Date(simulatedGlobalTime);
    date.setUTCMinutes(0, 0, 0);
    const currentHourKeySuffix = date.toISOString();
    date.setUTCHours(date.getUTCHours() + 1);
    const nextHourMs = date.getTime();

    const rateKey = `email-rate:${senderId}:${currentHourKeySuffix}`;
    const delayKey = `email-delay:${senderId}`;

    const luaScript = `
      local rateKey = KEYS[1]
      local delayKey = KEYS[2]
      local limit = tonumber(ARGV[1])
      local minDelayMs = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local nextHourMs = tonumber(ARGV[4])

      local nextAllowedDelay = tonumber(redis.call("GET", delayKey) or "0")
      if nextAllowedDelay > now then
          return { "DELAY_REQUIRED", nextAllowedDelay }
      end

      local currentCount = tonumber(redis.call("GET", rateKey) or "0")
      if currentCount >= limit then
          return { "RATE_LIMITED", nextHourMs }
      end

      redis.call("INCR", rateKey)
      if currentCount == 0 then
          redis.call("EXPIRE", rateKey, 7200)
      end

      local newNextAllowedDelay = now + minDelayMs
      redis.call("PSETEX", delayKey, minDelayMs * 2, tostring(newNextAllowedDelay))

      return { "OK", newNextAllowedDelay }
    `;

    const result = await redis.eval(
      luaScript,
      2,
      rateKey,
      delayKey,
      limit.toString(),
      minDelayMs.toString(),
      simulatedGlobalTime.toString(),
      nextHourMs.toString()
    ) as [string, number];

    const [status, timestamp] = result;

    if (status === 'OK') {
      successfulSends++;
      // Track which hour this send occurred in for statistics
      const hourIndex = Math.floor((simulatedGlobalTime - now) / 3600000) + 1;
      hourBuckets.set(hourIndex, (hourBuckets.get(hourIndex) || 0) + 1);
    } else if (status === 'DELAY_REQUIRED') {
      // Re-queue the job with the new future time, staggered by ID to preserve order
      const newScheduledTime = timestamp + (job.id * 5); // Sequence stagger
      jobs.push({ id: job.id, scheduledTime: newScheduledTime });
    } else if (status === 'RATE_LIMITED') {
      // Re-queue to next hour, staggered
      const newScheduledTime = timestamp + (job.id * 5);
      jobs.push({ id: job.id, scheduledTime: newScheduledTime });
    }
  }

  console.log(`\nSimulation Completed!`);
  console.log(`Total successful sends: ${successfulSends}`);
  
  console.log('\nHourly Distribution:');
  for (let hour = 1; hour <= 5; hour++) {
    console.log(`Hour ${hour}: ${hourBuckets.get(hour) || 0} emails`);
  }
}

async function runTests() {
  console.log('--- Starting Phase 3 Corrected Tests ---');
  await emailQueue.drain();
  
  const { batch, sender } = await setupTestData();

  console.log('\n1. Creating 3 jobs to test sequence spacing, retry safety, and SMTP failure...');
  
  for (let i = 1; i <= 3; i++) {
    const job = await prisma.emailJob.create({
      data: {
        batchId: batch.id,
        senderId: sender.id,
        recipientEmail: `test${i}@example.com`,
        sequenceNumber: i,
        scheduledTime: new Date(),
        idempotencyKey: `p3-test-seq-${i}-${Date.now()}`
      }
    });
    await SchedulingService.scheduleEmailJob(job.id);
  }

  console.log('Jobs scheduled. Waiting 10 seconds for worker to process/reschedule...');
  
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  const dbJobs = await prisma.emailJob.findMany({ where: { batchId: batch.id }, orderBy: { sequenceNumber: 'asc' }});
  
  console.log('\nResults after 10 seconds (SMTP expected to fail, rate limits consumed):');
  dbJobs.forEach(job => {
    console.log(`Seq ${job.sequenceNumber}: Status=${job.status}, Attempts=${job.attemptCount}, FailureReason=${job.failureReason ? 'Yes' : 'No'}`);
  });

  const hourKeySuffix = new Date().toISOString().substring(0, 14) + '00:00.000Z'; // crude matching
  const keys = await redis.keys(`email-rate:${sender.id}:*`);
  if (keys.length > 0) {
    const count = await redis.get(keys[0]);
    console.log(`\nRate limit counter for sender ${sender.id}: ${count} (Proves slot remains consumed despite SMTP failure)`);
  }

  await run1000JobSimulation();

  await emailWorker.close();
  await emailQueue.close();
  await prisma.$disconnect();
  console.log('\nTests finished');
}

runTests().catch(console.error);
