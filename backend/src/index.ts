import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import RedisStore from 'connect-redis';
import passport from './config/passport';
import { appConfig } from './config/app';
import redis from './config/redis';
import authRoutes from './modules/auth/auth.routes';
import senderRoutes from './modules/emails/senders.routes';
import emailRoutes from './modules/emails/emails.routes';
import prisma from './database/prisma';
import { SchedulingService } from './modules/emails/services/scheduling.service';
import './queue/email.worker'; // initialize worker

const app = express();

app.use(express.json());

// Trust the reverse proxy (Render) so secure cookies can be set over HTTPS
app.set('trust proxy', 1);

// CORS configuration for specific frontend origin
app.use(cors({
  origin: appConfig.frontendUrl,
  credentials: true,
}));

// Session configuration
const redisStore = new RedisStore({
  client: redis,
  prefix: 'session:',
});

const isProd = appConfig.frontendUrl.includes('vercel') || process.env.NODE_ENV?.trim() === 'production';

app.use(session({
  store: redisStore,
  secret: appConfig.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api/emails', emailRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Startup Recovery Mechanism
async function recoverPendingPublications() {
  try {
    const pendingJobs = await prisma.emailJob.findMany({
      where: { queuePublished: false, status: 'SCHEDULED' }
    });

    if (pendingJobs.length > 0) {
      console.log(`[Startup Recovery] Found ${pendingJobs.length} EmailJobs awaiting initial BullMQ publication. Recovering...`);
      let recovered = 0;
      for (const job of pendingJobs) {
        try {
          await SchedulingService.scheduleEmailJob(job.id);
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { queuePublished: true }
          });
          recovered++;
        } catch (error) {
          console.error(`[Startup Recovery] Failed to recover job ${job.id}`, error);
        }
      }
      console.log(`[Startup Recovery] Successfully recovered ${recovered}/${pendingJobs.length} jobs.`);
    }
  } catch (error) {
    console.error(`[Startup Recovery] Fatal error during recovery check:`, error);
  }
}

export { app };

const PORT = process.env.PORT || 3000;
// Only start the server if not required by a test file
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await recoverPendingPublications();
  });
}
