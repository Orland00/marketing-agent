import type { InlineKeyboardButton } from '../types.js';

const BASE_URL = 'https://api.telegram.org/bot';

export class TelegramClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || 'Unknown'}`);
    }
    return data.result;
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
    }
  ): Promise<unknown> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
      reply_markup: options?.replyMarkup,
    });
  }

  async editMessage(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
    }
  ): Promise<unknown> {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parseMode || 'HTML',
      reply_markup: options?.replyMarkup,
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string
  ): Promise<unknown> {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  async setWebhook(url: string, secretToken: string): Promise<unknown> {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  async getFile(fileId: string): Promise<{ file_path: string }> {
    const result = await this.call('getFile', { file_id: fileId });
    return result as { file_path: string };
  }

  getFileUrl(filePath: string): string {
    return `https://api.telegram.org/file/bot${this.token}/${filePath}`;
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const fileInfo = await this.getFile(fileId);
    const url = this.getFileUrl(fileInfo.file_path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
    return res.arrayBuffer();
  }
}
