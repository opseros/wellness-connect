// Outbox event handlers. Imported once by the cron route.
import { and, eq } from "drizzle-orm";
import { credential, enquiry, invoice, organization, professionalProfile, proposal, user } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { registerOutboxHandler } from "./outbox";
import { orgAdminEmails } from "@/modules/organizations/service";
import { sendRefundToRazorpay } from "@/modules/marketplace/payments";
import { BRAND } from "@/lib/brand";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

registerOutboxHandler("membership.requested", async (tx, p) => {
  const emails = await orgAdminEmails(String(p.orgId), tx);
  for (const to of emails) {
    await sendEmail({
      to,
      subject: "New request to join your organization",
      text: `${p.email} asked to join your organization on ${BRAND.name}.\nReview it: ${appUrl()}/company/${p.orgId}/settings#members`,
    });
  }
});

registerOutboxHandler("enquiry.sent", async (tx, p) => {
  const pro = await tx.query.user.findFirst({ where: eq(user.id, String(p.professionalUserId)) });
  if (pro)
    await sendEmail({
      to: pro.email,
      subject: "New enquiry from a company",
      text: `A company would like a proposal from you. See the details and respond:\n\n${appUrl()}/pro/enquiries/${p.enquiryId}`,
    });
});

registerOutboxHandler("booking.created", async (tx, p) => {
  const pro = await tx.query.user.findFirst({ where: eq(user.id, String(p.professionalUserId)) });
  if (pro) await sendEmail({ to: pro.email, subject: "Your proposal was accepted", text: `A company accepted your proposal. Details: ${appUrl()}/pro/proposals` });
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
  await sendEmail({ to: pro.email, subject: "Update on your credential review", text: `${outcome}\n\n${appUrl()}/pro/credentials` });
});

registerOutboxHandler("proposal.submitted", async (tx, p) => {
  const to = await tx.query.user.findFirst({ where: eq(user.id, String(p.createdBy)) });
  if (!to || to.deletedAt) return;
  await sendEmail({
    to: to.email,
    subject: p.revised ? "A professional revised their proposal" : "New proposal for your wellness requirement",
    text: `${p.revised ? "A professional sent an updated proposal" : "A professional sent a proposal"} for one of your requirements. Compare proposals:\n\n${appUrl()}/company/${p.orgId}/requirements/${p.requirementId}/proposals`,
  });
});

const ist = (iso: unknown) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(String(iso)));

async function emailPro(tx: Parameters<Parameters<typeof registerOutboxHandler>[1]>[0], userId: unknown, subject: string, text: string) {
  const pro = await tx.query.user.findFirst({ where: eq(user.id, String(userId)) });
  if (pro && !pro.deletedAt) await sendEmail({ to: pro.email, subject, text });
}

registerOutboxHandler("proposal.revision_requested", async (tx, p) => {
  const prop = await tx.query.proposal.findFirst({ where: eq(proposal.id, String(p.proposalId)) });
  const enq = prop && (await tx.query.enquiry.findFirst({ where: and(eq(enquiry.requirementId, prop.requirementId), eq(enquiry.professionalUserId, prop.professionalUserId)) }));
  await emailPro(
    tx,
    p.professionalUserId,
    "A company asked you to revise your proposal",
    `The company would like some changes before deciding:\n\n${prop?.revisionNote ?? ""}\n\nUpdate your proposal: ${appUrl()}/pro/enquiries/${enq?.id ?? ""}`,
  );
});

registerOutboxHandler("proposal.not_selected", async (tx, p) => {
  await emailPro(tx, p.professionalUserId, "Update on your proposal", `The company chose another professional for this engagement. Thank you for your proposal.\n\n${appUrl()}/pro/proposals`);
});

registerOutboxHandler("requirement.withdrawn", async (tx, p) => {
  await emailPro(tx, p.professionalUserId, "A company withdrew its requirement", `A company you were talking to has withdrawn its requirement, so no further action is needed.\n\n${appUrl()}/pro/enquiries`);
});

registerOutboxHandler("enquiry.reminder", async (tx, p) => {
  await emailPro(tx, p.professionalUserId, "Reminder: a company is waiting for your proposal", `A company is still waiting to hear from you about their enquiry:\n\n${appUrl()}/pro/enquiries/${p.enquiryId}`);
});

registerOutboxHandler("booking.rescheduled", async (tx, p) => {
  await emailPro(
    tx,
    p.professionalUserId,
    "A booking was rescheduled",
    `A company moved your session from ${ist(p.from)} to ${ist(p.to)} (India time).${p.reason ? `\n\nReason: ${p.reason}` : ""}\n\nIf the new time doesn't work, reply to the company directly.\n\n${appUrl()}/pro/proposals`,
  );
});

registerOutboxHandler("booking.cancelled", async (tx, p) => {
  await emailPro(
    tx,
    p.professionalUserId,
    "A booking was cancelled",
    `A company cancelled your session${p.late ? " inside your free-cancellation window" : ""}.\n\nReason: ${p.reason}\n\n${appUrl()}/pro/proposals`,
  );
});

const rupees = (paise: unknown) => `₹${(Number(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Company money emails go to owners/admins, the person who asked, and the billing address. */
async function companyRecipients(tx: Parameters<Parameters<typeof registerOutboxHandler>[1]>[0], orgId: unknown, extraUserId?: unknown) {
  const set = new Set(await orgAdminEmails(String(orgId), tx));
  const org = await tx.query.organization.findFirst({ where: eq(organization.id, String(orgId)) });
  if (org?.billingEmail) set.add(org.billingEmail);
  if (extraUserId) {
    const u = await tx.query.user.findFirst({ where: eq(user.id, String(extraUserId)) });
    if (u && !u.deletedAt) set.add(u.email);
  }
  return [...set];
}

registerOutboxHandler("invoice.issued", async (tx, p) => {
  const inv = await tx.query.invoice.findFirst({ where: eq(invoice.id, String(p.invoiceId)) });
  if (!inv) return;
  for (const to of await companyRecipients(tx, p.orgId, p.requestedBy)) {
    await sendEmail({
      to,
      subject: `Invoice ${inv.number} for ${rupees(inv.totalPaise)}`,
      text: `Your tax invoice ${inv.number} for ${rupees(inv.totalPaise)} is ready${inv.dueAt ? `, due ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(inv.dueAt)}` : ""}. The bank details are on the invoice.\n\n${appUrl()}/company/${p.orgId}/invoices/${inv.id}`,
    });
  }
});

registerOutboxHandler("payment.received", async (tx, p) => {
  const inv = await tx.query.invoice.findFirst({ where: eq(invoice.id, String(p.invoiceId)) });
  for (const to of await companyRecipients(tx, p.orgId)) {
    await sendEmail({
      to,
      subject: `Payment received${inv ? ` (invoice ${inv.number})` : ""}`,
      text: `Thank you. We've received ${inv ? rupees(inv.totalPaise) : "your payment"} and your booking is confirmed.\n\nInvoice: ${appUrl()}/company/${p.orgId}/invoices/${p.invoiceId}\nBooking: ${appUrl()}/company/${p.orgId}/bookings/${p.bookingId}`,
    });
  }
  await emailPro(tx, p.professionalUserId, "Booking confirmed and paid", `The company has paid for your booking. Your share is now due to you and will be transferred after the session.\n\n${appUrl()}/pro/proposals`);
});

registerOutboxHandler("refund.requested", async (tx, p) => {
  await sendRefundToRazorpay(tx, String(p.refundId));
});

registerOutboxHandler("refund.processed", async (tx, p) => {
  for (const to of await companyRecipients(tx, p.orgId)) {
    await sendEmail({
      to,
      subject: `Refund of ${rupees(p.amountPaise)} processed`,
      text: `We've refunded ${rupees(p.amountPaise)} for your cancelled booking. Card and UPI refunds usually reach you in 5–7 working days. A credit note is in your invoices.\n\n${appUrl()}/company/${p.orgId}/bookings/${p.bookingId}`,
    });
  }
});

registerOutboxHandler("payout.recorded", async (tx, p) => {
  await emailPro(tx, p.professionalUserId, `Payout of ${rupees(p.amountPaise)} sent`, `We've sent ${rupees(p.amountPaise)} to your bank account. It can take a working day to appear.\n\n${appUrl()}/pro/proposals`);
});

export {};
