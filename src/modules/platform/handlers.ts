// Outbox event handlers. Imported once by the cron route.
import { eq } from "drizzle-orm";
import { credential, professionalProfile, user } from "@/db/schema";
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

registerOutboxHandler("credential.reviewed", async (tx, p) => {
  const cred = await tx.query.credential.findFirst({ where: eq(credential.id, String(p.credentialId)) });
  if (!cred) return;
  const profile = await tx.query.professionalProfile.findFirst({ where: eq(professionalProfile.id, cred.profileId) });
  const pro = profile && (await tx.query.user.findFirst({ where: eq(user.id, profile.userId) }));
  if (!pro) return;
  const outcome =
    p.decision === "approved"
      ? `"${cred.name}" was approved. Your profile is now verified and visible to companies.`
      : p.decision === "info_requested"
        ? `We need a little more information about "${cred.name}":\n\n${cred.reviewNote ?? ""}\n\nPlease upload an updated document.`
        : `"${cred.name}" could not be approved:\n\n${cred.reviewNote ?? ""}`;
  await sendEmail({ to: pro.email, subject: "Update on your credential review", text: `${outcome}\n\n${appUrl()}/app` });
});

export {};
