// Outbox event handlers. Imported once by the cron route.
import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { registerOutboxHandler } from "./outbox";
import { orgAdminEmails } from "@/modules/organizations/service";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

registerOutboxHandler("membership.requested", async (tx, p) => {
  const emails = await orgAdminEmails(String(p.orgId), tx);
  for (const to of emails) {
    await sendEmail({
      to,
      subject: "New request to join your organization",
      text: `${p.email} asked to join your organization on Wellness Connect.\nReview it: ${appUrl()}/app/organization`,
    });
  }
});

registerOutboxHandler("enquiry.sent", async (tx, p) => {
  const pro = await tx.query.user.findFirst({ where: eq(user.id, String(p.professionalUserId)) });
  if (pro) await sendEmail({ to: pro.email, subject: "New enquiry from a company", text: `You have a new enquiry. Respond here: ${appUrl()}/app` });
});

registerOutboxHandler("booking.created", async (tx, p) => {
  const pro = await tx.query.user.findFirst({ where: eq(user.id, String(p.professionalUserId)) });
  if (pro) await sendEmail({ to: pro.email, subject: "Your proposal was accepted", text: `A company accepted your proposal. Details: ${appUrl()}/app` });
});

registerOutboxHandler("connection.requested", async (tx, p) => {
  const to = await tx.query.user.findFirst({ where: eq(user.id, String(p.toUserId)) });
  if (to) await sendEmail({ to: to.email, subject: "New connection request", text: `Someone wants to connect with you. See it: ${appUrl()}/connect/network` });
});

export {};
