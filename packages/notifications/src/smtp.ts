import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';
import { ConnectorType, type Notification, type NotificationConnector } from './types.js';

/** SMTP channel configuration (validated at the edges). */
export const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.coerce.boolean().default(false),
  user: z.string().optional(),
  pass: z.string().optional(),
  from: z.string().email(),
  /** Comma-separated recipient list. */
  to: z.string().min(3),
});

export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

/** Sends notifications as email over SMTP (via nodemailer). */
export class SmtpConnector implements NotificationConnector {
  readonly type = ConnectorType.Smtp;
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
    });
  }

  async send(notification: Notification): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: notification.title,
      text: notification.message,
    });
  }
}
