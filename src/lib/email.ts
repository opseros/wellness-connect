import { Resend } from "resend";

export type Email = { to: string; subject: string; text: string };

// Outgoing mail for tests and local dev without a Resend key.
export const sentEmails: Email[] = [];

let client: Resend | undefined;

export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    sentEmails.push(email);
    if (process.env.NODE_ENV !== "test") console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }
  client ??= new Resend(key);
  const from = process.env.EMAIL_FROM ?? "Wellness Connect <no-reply@example.com>";
  const { error } = await client.emails.send({ from, to: email.to, subject: email.subject, text: email.text });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}
