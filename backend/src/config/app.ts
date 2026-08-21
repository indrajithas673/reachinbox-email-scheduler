import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  processingTimeoutMs: parseInt(process.env.PROCESSING_TIMEOUT_MS || '300000', 10),
  minEmailDelayMs: parseInt(process.env.MIN_EMAIL_DELAY_MS || '5000', 10),
  maxEmailsPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR || '100', 10),
  etherealHost: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
  etherealPort: parseInt(process.env.ETHEREAL_PORT || '587', 10),
  googleClientId: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy-client-secret',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
  sessionSecret: process.env.SESSION_SECRET || 'fallback-secret-for-dev',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};
