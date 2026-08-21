# ReachInbox Email Scheduler

An email scheduling service built with Express, BullMQ, Redis, and PostgreSQL, alongside a React frontend for tracking and scheduling emails. It uses Google OAuth for authentication and Ethereal SMTP for email delivery. It handles delayed email dispatch while enforcing sender rate limits and minimum-delay requirements.

## Features
- **Google OAuth 2.0**: Authentication using Passport.js and Google APIs.
- **Background Processing**: Queue management via BullMQ and Redis.
- **Rate Limiting**: Redis Lua scripts track and enforce `MAX_EMAILS_PER_HOUR` per sender.
- **Minimum-Delay Enforcement**: Enforces a configurable `MIN_EMAIL_DELAY_MS` interval between consecutive emails for the same sender.
- **Auto-Rescheduling**: Pushes emails to the next UTC hour when hourly rate limits are reached.
- **Crash Recovery**: Database state tracking (SCHEDULED → PROCESSING → SENT/FAILED) prevents dropped emails.
- **Frontend Dashboard**: A React UI to schedule emails via CSV, manage senders, and monitor the queue.

## Tech Stack
- **Backend**: Node.js, Express, TypeScript, Prisma ORM
- **Frontend**: React, Vite, TailwindCSS, Axios
- **Database**: PostgreSQL
- **Queues & Coordination**: Redis, BullMQ
- **Email Dispatch**: Nodemailer, Ethereal SMTP

## Project Structure
```text
reachinbox-email-scheduler/
├── backend/                  # Express API, Worker, Prisma, Tests
│   ├── src/queue/            # BullMQ worker & Lua coordination service
│   ├── src/modules/          # Route handlers (Auth, Emails, Senders)
│   └── prisma/               # Database schema
├── frontend/                 # Vite React Application
│   ├── src/pages/            # Dashboard, Login, Compose
│   └── src/components/       # React components
├── docker-compose.yml        # PostgreSQL & Redis infrastructure
└── README.md
```

## How It Works

### Scheduling
When a user schedules an email batch through the API or CSV upload, the backend creates `EmailJob` rows in PostgreSQL with a `SCHEDULED` status. The backend then adds these jobs to the BullMQ delayed queue based on their requested start time and interval spacing.

### Worker Processing
A background BullMQ worker consumes jobs when their delay expires. The worker attempts to lock the job in PostgreSQL by updating its status to `PROCESSING` using an atomic `updateMany` query. If the database update succeeds, the worker proceeds with dispatch.

### Rate Limiting
Before sending an email, the worker calls a Redis Lua script. The script maintains an hourly counter scoped to the sender and the current UTC hour. If sending the email would exceed `MAX_EMAILS_PER_HOUR`, the script returns a `RATE_LIMITED` directive.

### Minimum Delay
The Redis Lua script also checks a `PSETEX` Redis lock that enforces the sender's minimum required delay. If the required delay time hasn't passed, the script returns a `DELAY_REQUIRED` directive. Note: If the configured delay is 0, the script bypasses creating the zero-TTL `PSETEX` lock entirely, allowing the job to proceed without an artificial delay.

### Retry & Failure Handling
If the SMTP dispatch throws an error (e.g. invalid credentials or network failure), the worker throws an error so BullMQ can retry the job using its built-in exponential backoff. After 3 failed attempts, the database status is updated to `FAILED` and the error message is recorded.

### Restart Recovery
If the server stops while processing emails:
1. Jobs stuck in `PROCESSING` beyond the timeout threshold are reclaimed by workers on restart.
2. If PostgreSQL shows a job with a future `scheduledTime` but it is missing from BullMQ, the backend recreates the delayed BullMQ job.

### Idempotency
Duplicate BullMQ executions are skipped. The worker checks the database status before attempting SMTP dispatch. If a job is already marked as `SENT` or actively `PROCESSING` elsewhere, the duplicate execution exits early to avoid double-sending.

## Running Locally

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose
- A Google Cloud OAuth Client ID & Secret

### Environment Variables
Duplicate the `.env.example` files in both directories:
- `backend/.env` (Google OAuth credentials, Database URLs, Limit configurations)
- `frontend/.env` (Vite API URL)

### Start PostgreSQL + Redis
```bash
docker-compose up -d
```

### Backend
```bash
cd backend
npm install
npx prisma db push
npm run dev
```

### Worker
The worker is started automatically alongside the backend API process when running `npm run dev`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Google OAuth Setup
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a Project > APIs & Services > Credentials.
3. Create an **OAuth Client ID** (Web Application).
4. Add Authorized Redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Copy the Client ID and Secret into `backend/.env`.

## Ethereal Email Setup
Ethereal provides a fake SMTP service for testing.
1. Go to [Ethereal Email](https://ethereal.email/).
2. Click **Create Ethereal Account**.
3. Copy the generated Username and Password into the backend `.env` as `ETHEREAL_USER` and `ETHEREAL_PASSWORD`, or register them via the UI Dashboard's Sender configuration.

## API Overview
- `GET /api/auth/google` - Initiates OAuth flow.
- `GET /api/auth/me` - Validates session.
- `POST /api/senders` - Registers SMTP configurations per user.
- `POST /api/emails/schedule` - Main endpoint to schedule an array of recipients.
- `GET /api/emails/scheduled` - Retrieves upcoming jobs.
- `GET /api/emails/sent` - Retrieves completed and failed jobs.

## Frontend
The React application matches the provided ReachInbox Figma layout. It requires Google authentication and uses React state for data management. It supports CSV parsing for batch uploads, sender selection, and queue status tracking.

## Testing
The backend includes an automated test suite to verify API validation, user data isolation, and queue behavior.
```bash
cd backend
npx tsx src/tests/test_api.ts
```

## Assignment Requirement Mapping
- **Google OAuth Only**: Enforced via Passport.js; no standard password login is implemented.
- **Queue/Redis Approach**: Uses BullMQ for queue management.
- **Hourly Rate Limit**: Enforced via a custom Redis Lua script (`coordination.service.ts`).
- **Minimum Delay**: PSETEX spacing enforced via Lua.
- **No Cron Jobs**: Scheduling relies on BullMQ delayed jobs instead of cron polling.
- **Scale Safety**: Workers use atomic database queries to claim jobs.

## Assumptions & Trade-offs
- **Idempotency Strategy**: True distributed exactly-once SMTP delivery is difficult without email provider webhook support. There is a documented crash-window where an email could be sent but the worker crashes before updating PostgreSQL to `SENT`, resulting in a duplicate send upon retry.
- **Ethereal Delivery**: Actual delivery depends on Ethereal's uptime. Nodemailer is used instead of a specific provider SDK to make testing easier.
- **Rate Limit Queueing**: Instead of rejecting API requests when limits are hit, the system accepts them and schedules them for the next available UTC hour.

## Demo
Please refer to the submission link for the screen recording demonstrating the dashboard, rate limiting, and job transitions.
