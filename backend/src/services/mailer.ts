import type { Sender } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';
import { htmlToText } from '../utils/html';

const transports = new Map<string, Transporter>();

function transportFor(sender: Sender): Transporter {
  let t = transports.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpSecure,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 30_000,
    });
    transports.set(sender.id, t);
  }
  return t;
}

export interface OutgoingEmail {
  id: string;
  to: string;
  subject: string;
  /** Sanitized HTML from the composer */
  html: string;
}

export async function sendEmail(sender: Sender, email: OutgoingEmail) {
  const info = await transportFor(sender).sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to: email.to,
    subject: email.subject,
    text: htmlToText(email.html),
    html: `<div style="font-family:sans-serif">${email.html}</div>`,
    // Deterministic Message-ID: if a send is ever retried after a crash,
    // receiving servers can de-duplicate on it.
    messageId: `<${email.id}@reachinbox-scheduler.local>`,
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: previewUrl || null };
}

export function closeTransports() {
  for (const t of transports.values()) t.close();
  transports.clear();
}
