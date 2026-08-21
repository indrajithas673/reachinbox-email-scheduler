# ReachInbox Email Scheduler Demo Script

**Target Duration**: 5 minutes maximum
**Goal**: Demonstrate the architecture, functionality, and resilience of the system without filler.

---

### 0:00–0:30 Architecture overview
- **Visual**: Show the Mermaid architecture diagram from the README.
- **Script**: "Welcome to the ReachInbox email scheduler demo. The system architecture uses a React frontend and an Express Node.js backend. We use PostgreSQL as our absolute source of truth to persist email jobs, and we leverage BullMQ and Redis exclusively for distributed delayed scheduling and atomic rate limiting. We do not use any cron jobs or interval polling."

### 0:30–1:00 Google OAuth login
- **Visual**: Show the Login screen. Click "Login with Google", approve the consent screen, and redirect to the Dashboard.
- **Script**: "Here is the login screen, implemented precisely to the Figma specifications. We use real Google OAuth, completely avoiding mock auth. Once authenticated, Passport securely stores the session in Redis, protecting all underlying API routes and guaranteeing strict multi-tenant sender isolation."

### 1:00–2:00 Compose + CSV upload + scheduling
- **Visual**: Open the Compose view. Show the Sender dropdown. Upload a `.csv` file.
- **Script**: "Navigating to the Compose pane, we can select our authenticated sender. I'll upload a CSV file containing our recipients. The parsing and deduplication are securely handled entirely in the browser using PapaParse. The UI dynamically generates the recipient tags and reports the unique count. Let's set a 2-second minimum delay and a 100 hourly limit, then schedule."

### 2:00–2:45 Scheduled Emails
- **Visual**: Show the Scheduled Emails list on the Dashboard.
- **Script**: "Back on the dashboard, we instantly see the jobs in the Scheduled state. Behind the scenes, the API transactionally persisted these to PostgreSQL and natively injected delayed jobs into BullMQ. The sequence is deterministic, and our Redis Lua script strictly guarantees the atomic minimum delay reservation."

### 2:45–3:30 Ethereal delivery + Sent Emails
- **Visual**: Wait a few seconds, refresh/click the Sent tab. Show the jobs transitioning to Sent. Show Ethereal inbox briefly.
- **Script**: "Once the BullMQ delayed timer expires, the worker dynamically pulls the job, successfully reserves the slot, and dispatches the payload via Ethereal SMTP. When we switch to the Sent tab, we see the jobs properly updated with their actual terminal state."

### 3:30–4:20 Restart persistence demonstration
- **Visual**: Schedule a future batch (e.g. 2 minutes out). Kill the backend terminal (Ctrl+C). Wait 5 seconds. Restart the backend. Show the jobs executing successfully upon maturity.
- **Script**: "To prove our restart safety requirement, I'll schedule a future batch. Now, I'll forcefully kill the Node server. Because PostgreSQL is our persistent source of truth and BullMQ safely tracks state in Redis, our data is durable. When I restart the application, the worker initializer instantly sweeps for abandoned processing states, and the future jobs fire precisely when they mature."

### 4:20–5:00 BullMQ + Redis rate limiting + concurrency explanation
- **Visual**: Open `scheduling.service.ts` or `coordination.service.ts` briefly.
- **Script**: "Finally, this is only possible because we can run multiple concurrent workers safely. Our Redis Lua script atomically calculates sender-specific UTC hourly buckets and spacing, cleanly rescheduling any rate-limit overflows back into BullMQ for the next available hour. No jobs are dropped. Thank you."
