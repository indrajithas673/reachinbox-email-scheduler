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
    });
  }

  /**
   * Sends the email for a given EmailJob and Sender.
   * Throws an error if SMTP fails, allowing BullMQ to retry the job.
   */
  static async sendEmail(job: EmailJob, sender: Sender, subject: string, body: string): Promise<any> {
    const transporter = this.createTransporter(sender);
    
    // Attempt the send
    const info = await transporter.sendMail({
      from: `"${sender.displayName || ''}" <${sender.senderEmail}>`,
      to: job.recipientEmail,
      subject: subject,
      text: body, // simplified: using plain text for Phase 3
    });

    console.log(`[SMTP] Sent email ${job.id} to ${job.recipientEmail}. MessageId: ${info.messageId}`);
    return info;
  }
}
