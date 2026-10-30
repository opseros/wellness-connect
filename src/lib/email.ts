import { Resend } from "resend";

export type Email = { to: string; subject: string; text: string };

// Outgoing mail for tests and local dev without a Resend key.
export const sentEmails: Email[] = [];

let client: Resend | undefined;

const isLiveProduction = () => process.env.VERCEL_ENV === "production";

export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Never pretend to send in production: a missing key would silently block sign-ups.
    if (isLiveProduction()) throw new Error("RESEND_API_KEY is not set; cannot send email in production");
    sentEmails.push(email);
    if (process.env.NODE_ENV !== "test") console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }
  client ??= new Resend(key);
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");
  const { error } = await client.emails.send({ from, to: email.to, subject: email.subject, text: email.text });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}
