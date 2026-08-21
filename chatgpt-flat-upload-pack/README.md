# ReachInbox Email Scheduler

This repository implements a full-stack, distributed email scheduling engine.

## Core Features & Architecture Constraints
1. **No In-Memory Timers or Cron:** The system completely avoids `cron`, `setInterval`, or memory-polling. It relies exclusively on PostgreSQL for persistent state and BullMQ for delayed task scheduling.
2. **Crash Recovery & Idempotency:** The background worker dynamically recovers jobs left in the `PROCESSING` state during a sudden node failure by comparing `processingStartedAt` against a timeout threshold. Missing BullMQ jobs for database rows in `SCHEDULED` are reconstructed on boot.
3. **Distributed Rate Limiting:** A Redis Lua script enforces a strict `MAX_EMAILS_PER_HOUR` and `MIN_EMAIL_DELAY_MS` per sender ID. This script atomically evaluates the timestamp boundaries, preventing race conditions from concurrent workers.
4. **Google OAuth Session Auth:** Security relies on real Google OAuth (no mocks) backed by `express-session` stored securely in Redis.
5. **Deduplication:** CSV/TXT parsing and email deduplication happen natively in the browser via React before the payload hits the backend, preventing server exhaustion.

## Data Flow
1. **Frontend:** User logs in via Google OAuth. User uploads a CSV. React extracts emails, deduplicates them, and sends a schedule request to `/api/emails/schedule`.
2. **Backend API:** The API writes the jobs persistently to PostgreSQL with status `SCHEDULED`, assigning a sequential execution order. It immediately queues the first attempts into BullMQ.
3. **Queue Worker:** BullMQ workers wake up. They claim the DB record atomically to prevent parallel duplication. They hit the Redis Lua script for the rate limit. 
    - If Rate Limited, the DB status changes to `DELAYED_RATE_LIMIT` and BullMQ reschedules it for the start of the next UTC hour.
    - If Delay Required, it schedules for the exact millisecond slot.
    - If OK, it fires Ethereal SMTP and marks `SENT` in Postgres.

## Technology Stack
- **Database:** PostgreSQL via Prisma ORM
- **Queue & Rate Limits:** BullMQ, Redis, ioredis, Lua
- **API:** Express, TypeScript, express-session, Passport.js
- **Frontend:** React, Vite, Tailwind CSS, PapaParse
