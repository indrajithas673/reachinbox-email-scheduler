export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Sender {
  id: string;
  userId: string;
  senderEmail: string;
  etherealUsername: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailBatch {
  id: string;
  subject: string;
}

export interface EmailJob {
  id: string;
  recipientEmail: string;
  subject?: string;
  scheduledTime: string;
  actualSentTime: string | null;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DELAYED_RATE_LIMIT';
  sequenceNumber: number;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  senderId: string;
}

export interface ApiError {
  error: string;
  details?: any;
}
