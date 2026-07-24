import { z } from 'zod';
import { ConnectorType, type Notification, type NotificationConnector } from './types.js';

/** Telegram channel configuration. */
export const telegramConfigSchema = z.object({
  botToken: z.string().min(10),
  chatId: z.string().min(1),
});

export type TelegramConfig = z.infer<typeof telegramConfigSchema>;

const TELEGRAM_TIMEOUT_MS = 10_000;

/** Sends notifications via the Telegram Bot API. */
export class TelegramConnector implements NotificationConnector {
  readonly type = ConnectorType.Telegram;

  constructor(private readonly config: TelegramConfig) {}

  async send(notification: Notification): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: `${notification.title}\n\n${notification.message}`,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Telegram API responded ${res.status}: ${body.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
