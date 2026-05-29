import { logger } from "firebase-functions";
import nodemailer, { Transporter } from "nodemailer";

// Centralized SMTP transporter for self-hosted email delivery (share-by-link emails,
// password reset, session recording shares). Falls back to a "log-only" transport
// when SMTP_HOST is unset, so local dev without an SMTP relay still observes the
// payload in the functions log.

type SmtpEnv = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromName: string;
  fromEmail: string;
};

const readEnv = (): SmtpEnv | null => {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    // SMTP_SSL=true → implicit TLS (port 465). Anything else → STARTTLS (port 587 default).
    secure: (process.env.SMTP_SSL ?? "true").toLowerCase() === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
    fromName: process.env.SMTP_FROM_NAME ?? "Self-hosted Requestly",
    fromEmail: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "no-reply@localhost",
  };
};

let cachedTransporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  const env = readEnv();
  if (!env) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: env.user && env.pass ? { user: env.user, pass: env.pass } : undefined,
  });
  return cachedTransporter;
};

export const isMailerConfigured = (): boolean => readEnv() !== null;

export const publicAppUrl = (): string =>
  (process.env.PUBLIC_APP_URL ?? "http://localhost:3005").replace(/\/+$/, "");

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Optional reply-to override. Defaults to the SMTP_FROM_EMAIL. */
  replyTo?: string;
};

export const sendMail = async (args: SendArgs): Promise<void> => {
  const env = readEnv();
  if (!env) {
    // No SMTP wired — log the payload so a developer sees what would have been sent.
    logger.warn("SMTP not configured; would have sent email", {
      to: args.to,
      subject: args.subject,
      preview: args.text ?? args.html.slice(0, 200),
    });
    return;
  }

  const transporter = getTransporter()!;
  const from = `"${env.fromName.replace(/"/g, '\\"')}" <${env.fromEmail}>`;

  try {
    const info = await transporter.sendMail({
      from,
      to: Array.isArray(args.to) ? args.to.join(", ") : args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      replyTo: args.replyTo,
    });
    logger.info("mail sent", { to: args.to, subject: args.subject, messageId: info.messageId });
  } catch (err) {
    logger.error("mail send failed", { to: args.to, subject: args.subject, err });
    throw err;
  }
};
