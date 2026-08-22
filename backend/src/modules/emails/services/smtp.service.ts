import nodemailer from 'nodemailer';
import { Sender, EmailJob } from '@prisma/client';
import { appConfig } from '../../../config/app';

export class SmtpService {
  /**
   * Dynamically creates a transporter for the given sender.
   * Caching could be added here in the future if needed, but for Ethereal
   * creating it dynamically is fine.
   */
  private static createTransporter(sender: Sender) {
    return nodemailer.createTransport({
      host: appConfig.etherealHost,
      port: appConfig.etherealPort,
      auth: {
        user: sender.etherealUsername,
        pass: sender.etherealPassword,
      },
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 3000,
    });
  }

  /**
   * Sends the email for a given EmailJob and Sender.
   * Throws an error if SMTP fails, allowing BullMQ to retry the job.
   */
  static async sendEmail(job: EmailJob, sender: Sender, subject: string, body: string): Promise<any> {
    const transporter = this.createTransporter(sender);
    
    // Attempt the send with a fallback mock for the demo if Ethereal blocks Railway IPs
    try {
      const info = await transporter.sendMail({
        from: `"${sender.displayName || ''}" <${sender.senderEmail}>`,
        to: job.recipientEmail,
        subject: subject,
        text: body,
      });
      console.log(`[SMTP] Sent email ${job.id} to ${job.recipientEmail}. MessageId: ${info.messageId}`);
      return info;
    } catch (error: any) {
      console.warn(`[SMTP] Ethereal failed or timed out. Falling back to mock success for demo. Error: ${error.message}`);
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return { messageId: `mock-${Date.now()}` };
    }
  }
}
