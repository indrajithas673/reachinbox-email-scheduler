# ReachInbox Email Scheduler

## Overview
A full-stack email scheduling system inspired by the core scheduling workflow of ReachInbox. 

It accepts scheduled email requests, persists email jobs in PostgreSQL, and schedules delivery using BullMQ delayed jobs. Distributed coordination is handled via Redis, enforcing configurable limits across multiple senders. The system successfully survives application and worker restarts, routing messages through Ethereal SMTP. It features a React dashboard supporting real Google OAuth, detailed scheduled and sent email views, and CSV recipient parsing.

## Features
- Persistent email job state in PostgreSQL
- Native delayed scheduling using BullMQ
- Atomic distributed hourly rate limiting using Redis Lua scripts
- Minimum interval send-slot reservation spacing
- Restart recovery for abandoned and pending queue items
- Multi-tenant sender isolation
- React dashboard matching Figma design tokens
- Client-side CSV/TXT parsing and email deduplication
- Real Google OAuth integration

## Tech Stack
**Backend**:
- Node.js
- TypeScript
- Express.js
- PostgreSQL
- Prisma
- BullMQ
- Redis
- ioredis
- Nodemailer
- Ethereal Email
- Google OAuth (Passport)
- express-session
- connect-redis
- Zod

**Frontend**:
- React
- Vite
- TypeScript
- Tailwind CSS

## Architecture
```mermaid
flowchart TD
    ReactFrontend["React Frontend"] -- HTTP + session cookie --> ExpressAPI["Express API"]
    
    ExpressAPI --> PostgreSQL["PostgreSQL"]
    ExpressAPI --> Redis["Redis"]
    
    Redis -- Redis Sessions --> ExpressAPI
    Redis -- BullMQ --> ExpressAPI
    Redis -- Rate Limit Lua --> ExpressAPI
    
    PostgreSQL --> EmailJob["EmailJob"]
    EmailJob --> BullMQDelayed["BullMQ Delayed Queue"]
    BullMQDelayed --> EmailWorker["Email Worker"]
    EmailWorker --> EtherealSMTP["Ethereal SMTP"]
```

## Scheduling Flow
1. API request is received
2. `EmailBatch` and individual `EmailJob` rows are transactionally persisted
3. Required `scheduledTime` is calculated for each sequence
4. A BullMQ delayed job is injected into the queue matching the scheduled time
5. The worker pulls the delayed job upon maturity
6. Redis Lua coordination checks hourly capacity and minimum delay
7. Email sent via Ethereal SMTP

*Note: The system does not use cron jobs, OS-level cron, or in-memory timers for email scheduling. It relies exclusively on robust BullMQ delayed queues.*

## Rate Limiting & Concurrency
Multiple BullMQ workers can process jobs concurrently (controlled by `WORKER_CONCURRENCY`). Concurrency is managed atomically across instances:

- **Hourly limit**: A Redis counter is maintained per sender and UTC hour (conceptually: `email-rate:{senderId}:{utcHour}`).
- **Minimum delay**: A sender-specific Redis key controls the next permitted send slot.
- **Atomicity**: A Lua script checks and reserves the required resources atomically. This prevents multiple workers from simultaneously exceeding the configured limit or minimum spacing.

If the hourly limit is exhausted, the job is cleanly rescheduled and a new delayed job is generated for the next available UTC hour. Jobs are not dropped when the hourly quota is reached.

## Persistence & Restart Recovery
- PostgreSQL stores the durable email state.
- Redis/BullMQ stores delayed queue state.
- Deterministic BullMQ identities prevent unnecessary duplicate queue entries during re-evaluations.
- Queue-publication state tracks whether pending jobs successfully entered BullMQ.
- Worker recovery logic handles abandoned processing states on node startup, safely sweeping stalled jobs back into the active queue.

## Authentication
Google OAuth authenticates the user, upserts their record in the database via Passport, and establishes a Redis-backed Express session (via an HTTP-only cookie). This secures authenticated API routes and ensures strict user ownership isolation (User A cannot access User B's Senders or EmailJobs).

## Frontend
Closely implemented against the provided Figma design using React, TypeScript, and Tailwind. Features include the exact matched login UI, a primary dashboard, scheduled and sent email views, and a full-pane compose flow. The composer provides seamless client-side CSV/TXT upload with automatic recipient deduplication, loading states, empty states, and inline API error handling.

## Project Structure
- `backend/`: Express API, Prisma schema, BullMQ worker processes, queue configuration, and tests.
- `frontend/`: React application containing components (`layout`, `emails`, `compose`), services, and hooks.
- `docs/`: Discovery artifacts, demo scripts, and final checklists.

## Prerequisites
- Node.js v20+
- Docker and Docker Compose
- Google Cloud OAuth Credentials

## Environment Variables
Create `.env` in both directories using their `.env.example` as a template:

**`backend/.env.example`**
```text
PORT=3000
DATABASE_URL="postgresql://reachinbox_user:reachinbox_password@localhost:5432/reachinbox_db?schema=public"
REDIS_URL="redis://localhost:6379"

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=
ETHEREAL_PASSWORD=

WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=5000
MAX_EMAILS_PER_HOUR=100
PROCESSING_TIMEOUT_MS=300000
```

**`frontend/.env.example`**
```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
SESSION_SECRET=
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:3000
```

## Running PostgreSQL & Redis
```bash
docker-compose up -d
```

## Local Setup
1. Clone the repository
2. Start PostgreSQL + Redis (`docker-compose up -d`)
3. Configure backend `.env`
4. Install backend dependencies (`cd backend && npm install`)
5. Run Prisma migrations (`npx prisma migrate dev`)
6. Start backend (`npm start`)
7. Configure frontend `.env`
8. Install frontend dependencies (`cd frontend && npm install`)
9. Start frontend (`npm run dev`)

## Running the Backend
```bash
cd backend
npm run build
npm start
```

## Running the Frontend
```bash
cd frontend
npm run build
npm run dev
```

## Testing
To run the automated backend test suite covering authentication, API validation, deduplication, worker scheduling, queue publication recovery, rate limiting isolation, and restart persistence:
```bash
cd backend
npm run build
npx tsx src/tests/test_api.ts
```

## Demo
Please refer to `docs/demo-script.md` for the 5-minute video demonstration overview. Ethereal is used as a fake SMTP provider for assignment testing; emails are not delivered to real recipients.

## Assumptions & Trade-offs
- **SMTP crash window**: If the SMTP provider accepts a message and the application crashes before PostgreSQL records the successful delivery, a later recovery attempt cannot perfectly distinguish that external acceptance from an unsent message. Absolute exactly-once external SMTP delivery cannot be guaranteed without distributed transaction support from the provider.
- **Rate-limit reservation**: The rate-limit slot is reserved before SMTP delivery. If the delivery fails, the slot conceptually remains consumed for the hour window.
- **Ordering**: Sequence numbers provide deterministic scheduling preference, but distributed workers do not provide an absolute strict global execution ordering guarantee.
- **Minimum delay semantics**: The configured minimum delay controls spacing between authorized sender send-slot reservations. It coordinates when a worker is allowed to initiate an outbound request; it does not guarantee identical spacing between network-level SMTP completion timestamps.
- **CSV parsing**: Recipient parsing occurs purely client-side to prevent malicious payloads from exhausting backend CPU resources.
- **Ethereal**: Used only for testing.

## Assignment Requirement Mapping
| Requirement | Implementation |
| :--- | :--- |
| TypeScript backend | Yes, heavily typed with `zod` and Prisma client. |
| Express | Yes, provides REST API layer. |
| BullMQ | Yes, handles persistent scheduling exclusively via delayed jobs. |
| Redis | Yes, coordinates BullMQ and atomic Lua rate limits. |
| PostgreSQL | Yes, acts as the primary source of truth for email status. |
| Ethereal | Yes, injected via environment mapping inside NodeMailer. |
| Delayed scheduling | Yes, maps relative timestamps to BullMQ delayed entry inputs. |
| No cron | Yes, zero usage of node-cron, setInterval, or agenda verified. |
| Persistence | Yes, Prisma records queue publication integrity. |
| Restart recovery | Yes, orphaned jobs sweep on initialization. |
| Worker concurrency | Yes, isolated by `WORKER_CONCURRENCY` env vars. |
| Minimum delay | Yes, atomic Lua script locks sender slots dynamically. |
| Hourly rate limit | Yes, Redis UTC hourly keys enforce hard quotas. |
| Multiple senders | Yes, Sender DB entities isolate rate limits and credentials. |
| Rate-limit rescheduling| Yes, `DELAYED_RATE_LIMIT` dynamically bumps job times safely. |
| Google OAuth | Yes, `passport-google-oauth20` securely stores users. |
| Dashboard | Yes, built closely to Figma layout in React. |
| Compose | Yes, features a dynamic CSV parsed interface. |
| CSV/TXT | Yes, PapaParse deduplicates addresses locally. |
| Scheduled list | Yes, features visual badges mapping to DB logic. |
| Sent list | Yes, accurately displays terminal success payloads. |
| Loading states | Yes, skeletal UI components mapped across routes. |
| Empty states | Yes, friendly icons notify users of 0 active items. |
| Error handling | Yes, 401s clear context dynamically, preventing ghosting. |
