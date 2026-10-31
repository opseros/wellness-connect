// Outbox event handlers. Imported once by the cron route.
import { and, eq } from "drizzle-orm";
import { credential, enquiry, group, groupMember, invoice, listing, organization, stay, stayInvoice, professionalProfile, proposal, user } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { registerOutboxHandler } from "./outbox";
import { orgAdminEmails } from "@/modules/organizations/service";
import { sendRefundToRazorpay } from "@/modules/marketplace/payments";
import { sendStayRefundToRazorpay } from "@/modules/marketplace/stay-payments";
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

registerOutboxHandler("group.join_requested", async (tx, p) => {
  const g = await tx.query.group.findFirst({ where: eq(group.id, String(p.groupId)) });
  if (!g) return;
  const mods = await tx
    .select({ email: user.email })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.userId))
    .where(and(eq(groupMember.groupId, g.id), eq(groupMember.role, "moderator"), eq(groupMember.status, "active")));
  for (const m of mods) {
    await sendEmail({ to: m.email, subject: `New request to join ${g.name}`, text: `Someone asked to join ${g.name}. Approve or decline: ${appUrl()}/connect/groups/${g.slug}` });
  }
});

const REFERRAL_SUBJECT: Record<string, string> = {
  pending: "You've received a referral",
  accepted: "Your referral was accepted",
  declined: "Your referral was declined",
  completed: "A referral was completed",
  withdrawn: "A referral was withdrawn",
};

registerOutboxHandler("referral.updated", async (tx, p) => {
  await emailPro(tx, p.toUserId, REFERRAL_SUBJECT[String(p.status)] ?? "Referral update", `See the details and the full history: ${appUrl()}/connect/referrals`);
});

export {};

registerOutboxHandler("listing.reviewed", async (tx, p) => {
  const orgId = String(p.orgId);
  const org = await tx.query.organization.findFirst({ where: eq(organization.id, orgId) });
  const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId) });
  if (!org || !l) return;
  const what = l.kind === "hospital" ? "hospital profile" : "homestay listing";
  const text =
    p.decision === "approved"
      ? `Good news: your ${what} "${org.name}" is verified and now appears in the ${BRAND.name} directory.`
      : p.decision === "changes_requested"
        ? `We need a few changes before "${org.name}" can go live:\n\n${l.reviewNote ?? ""}\n\nUpdate it and submit again.`
        : `We couldn't approve "${org.name}":\n\n${l.reviewNote ?? ""}`;
  for (const to of await orgAdminEmails(orgId, tx)) {
    await sendEmail({ to, subject: p.decision === "approved" ? `"${org.name}" is verified` : `Update on "${org.name}"`, text: `${text}\n\n${appUrl()}/listing/${orgId}` });
  }
});

// ---------- Homestay stays (M7) ----------

const rs = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dd = (d: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const istTime = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d) : "");

async function stayCtx(tx: Parameters<Parameters<typeof registerOutboxHandler>[1]>[0], stayId: string) {
  const st = await tx.query.stay.findFirst({ where: eq(stay.id, stayId) });
  if (!st) return null;
  const guest = await tx.query.user.findFirst({ where: eq(user.id, st.guestUserId) });
  const org = await tx.query.organization.findFirst({ where: eq(organization.id, st.orgId) });
  const dates = `${dd(st.checkIn)} to ${dd(st.checkOut)} (${st.nights} night${st.nights > 1 ? "s" : ""}, ${st.rooms} room${st.rooms > 1 ? "s" : ""})`;
  return { st, guest, org, dates };
}

registerOutboxHandler("stay.requested", async (tx, p) => {
  const c = await stayCtx(tx, String(p.stayId));
  if (!c?.org) return;
  for (const to of await orgAdminEmails(c.st.orgId, tx)) {
    await sendEmail({
      to,
      subject: `New booking request for ${c.org.name}`,
      text: `${c.guest?.name.split(" ")[0] ?? "A guest"} asked to stay ${c.dates}.\n\nPlease accept or decline by ${istTime(c.st.respondBy)}; after that the request lapses.\n${appUrl()}/listing/${c.st.orgId}/bookings`,
    });
  }
});

registerOutboxHandler("stay.accepted", async (tx, p) => {
  const c = await stayCtx(tx, String(p.stayId));
  if (!c?.guest || !c.org) return;
  await sendEmail({
    to: c.guest.email,
    subject: `${c.org.name} accepted your request`,
    text: `Good news: ${c.org.name} accepted your stay ${c.dates}.\n\nPay ${rs(c.st.totalPaise)} by ${istTime(c.st.payBy)} to confirm it; the rooms are held for you until then.\n${appUrl()}/stays/${c.st.id}`,
  });
});

registerOutboxHandler("stay.declined", async (tx, p) => {
  const c = await stayCtx(tx, String(p.stayId));
  if (!c?.guest || !c.org) return;
  await sendEmail({
    to: c.guest.email,
    subject: `${c.org.name} can't host you on these dates`,
    text: `${c.org.name} declined your request for ${c.dates}.${c.st.hostNote ? `\n\nNote from the host: ${c.st.hostNote}` : ""}\n\nYou haven't been charged. Find another stay: ${appUrl()}/homestays`,
  });
});

registerOutboxHandler("stay.expired", async (tx, p) => {
  const c = await stayCtx(tx, String(p.stayId));
  if (!c?.guest || !c.org) return;
  const why = p.stage === "payment" ? "the time to pay passed, so the rooms were released" : "the host didn't answer in time";
  await sendEmail({ to: c.guest.email, subject: `Your request for ${c.org.name} has lapsed`, text: `Your request for ${c.dates} has lapsed: ${why}. You haven't been charged.\n${appUrl()}/homestays` });
});

registerOutboxHandler("stay.confirmed", async (tx, p) => {
  const c = await stayCtx(tx, String(p.stayId));
  if (!c?.guest || !c.org) return;
  const inv = await tx.query.stayInvoice.findFirst({ where: eq(stayInvoice.id, String(p.invoiceId)) });
  await sendEmail({
    to: c.guest.email,
    subject: `Confirmed: ${c.org.name}, ${dd(c.st.checkIn)}`,
    text: `Your stay at ${c.org.name} is confirmed: ${c.dates}.\nPaid ${rs(c.st.totalPaise)}${inv ? `; tax invoice ${inv.number}` : ""}.\n${appUrl()}/stays/${c.st.id}`,
  });
  for (const to of await orgAdminEmails(c.st.orgId, tx)) {
    await sendEmail({
      to,
      subject: `Booking confirmed: ${dd(c.st.checkIn)}`,
      text: `${c.guest.name.split(" ")[0]} paid for ${c.dates}. Your share is ${rs(c.st.payablePaise)}, paid after check-in.\n${appUrl()}/listing/${c.st.orgId}/bookings`,
    });
  }
});

registerOutboxHandler("stay.cancelled", async (tx, p) => {
  const c = await stayCtx(tx, String(p.stayId));
  if (!c?.guest || !c.org) return;
  const refund = Number(p.refundPaise) > 0 ? ` A refund of ${rs(Number(p.refundPaise))} is on its way to the original payment method.` : "";
  if (p.byHost) {
    await sendEmail({ to: c.guest.email, subject: `${c.org.name} cancelled your stay`, text: `${c.org.name} had to cancel your stay ${c.dates}.${refund}\n\nReason: ${c.st.cancelReason ?? ""}\n${appUrl()}/homestays` });
  } else {
    await sendEmail({ to: c.guest.email, subject: `You cancelled your stay at ${c.org.name}`, text: `Your stay ${c.dates} is cancelled.${refund}\n${appUrl()}/stays/${c.st.id}` });
    for (const to of await orgAdminEmails(c.st.orgId, tx)) {
      await sendEmail({ to, subject: `Cancelled: ${dd(c.st.checkIn)}`, text: `${c.guest.name.split(" ")[0]} cancelled ${c.dates}. The rooms are free again.\n${appUrl()}/listing/${c.st.orgId}/bookings` });
    }
  }
});

registerOutboxHandler("stay_refund.requested", async (tx, p) => {
  await sendStayRefundToRazorpay(tx, String(p.refundId));
});

registerOutboxHandler("stay_refund.processed", async (tx, p) => {
  const guest = await tx.query.user.findFirst({ where: eq(user.id, String(p.guestUserId)) });
  if (!guest) return;
  await sendEmail({ to: guest.email, subject: "Your refund has been processed", text: `We've refunded ${rs(Number(p.amountPaise))} to your original payment method. Banks usually take 5–7 working days to show it.\n${appUrl()}/stays/${p.stayId}` });
});

registerOutboxHandler("stay_payout.recorded", async (tx, p) => {
  for (const to of await orgAdminEmails(String(p.orgId), tx)) {
    await sendEmail({ to, subject: "Payout sent", text: `We've sent ${rs(Number(p.amountPaise))} to your bank account for a recent stay.\n${appUrl()}/listing/${p.orgId}/bookings` });
  }
});
