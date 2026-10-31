import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { invoice } from "@/db/schema";
import { BRAND } from "@/lib/brand";

type Invoice = typeof invoice.$inferSelect;

// Standard PDF fonts have no ₹ glyph, so amounts are written as "INR".
const inr = (paise: number) => `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(d) : "");

const INK = rgb(0.094, 0.129, 0.114);
const MUTED = rgb(0.333, 0.38, 0.357);
const BRANDC = rgb(0.059, 0.42, 0.361);
const LINE = rgb(0.878, 0.898, 0.886);

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Keep only characters the standard WinAnsi font can draw.
const safe = (s: string) => s.replace(/₹/g, "INR ").replace(/[^\x20-\x7E -ÿ]/g, "");

/** A GST tax invoice or credit note as a one-page A4 PDF. */
export async function renderInvoicePdf(inv: Invoice, opts: { relatedNumber?: string | null; bankDetails?: string } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${inv.kind === "credit_note" ? "Credit note" : "Tax invoice"} ${inv.number}`);
  pdf.setAuthor(BRAND.name);
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 48;
  const W = 595.28 - M * 2;
  let y = 841.89 - M;

  const text = (p: PDFPage, s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: typeof INK; right?: boolean } = {}) => {
    const size = o.size ?? 10;
    const f = o.f ?? font;
    const str = safe(s);
    const xx = o.right ? x - f.widthOfTextAtSize(str, size) : x;
    p.drawText(str, { x: xx, y: yy, size, font: f, color: o.color ?? INK });
  };

  // Header
  text(page, BRAND.name, M, y, { size: 20, f: bold, color: BRANDC });
  text(page, BRAND.tagline, M, y - 14, { size: 9, color: MUTED });
  text(page, inv.kind === "credit_note" ? "CREDIT NOTE" : "TAX INVOICE", M + W, y, { size: 16, f: bold, right: true });
  text(page, inv.number, M + W, y - 16, { size: 10, right: true });
  text(page, `Date: ${date(inv.issuedAt)}`, M + W, y - 30, { size: 9, color: MUTED, right: true });
  if (inv.dueAt && inv.kind === "invoice") text(page, `Due: ${date(inv.dueAt)}`, M + W, y - 42, { size: 9, color: MUTED, right: true });
  if (opts.relatedNumber) text(page, `Against invoice ${opts.relatedNumber}`, M + W, y - 42, { size: 9, color: MUTED, right: true });
  y -= 72;

  // Parties
  const party = (label: string, p: Invoice["seller"], x: number) => {
    let yy = y;
    text(page, label, x, yy, { size: 8, f: bold, color: MUTED });
    yy -= 14;
    text(page, p.name, x, yy, { size: 11, f: bold });
    for (const line of wrap(safe(p.address || ""), font, 9, W / 2 - 16)) {
      yy -= 12;
      text(page, line, x, yy, { size: 9 });
    }
    if (p.gstin) {
      yy -= 12;
      text(page, `GSTIN: ${p.gstin}`, x, yy, { size: 9 });
    }
    if (p.email) {
      yy -= 12;
      text(page, p.email, x, yy, { size: 9, color: MUTED });
    }
    return yy;
  };
  const a = party("FROM", inv.seller, M);
  const b = party("BILL TO", inv.buyer, M + W / 2 + 8);
  y = Math.min(a, b) - 18;
  text(page, `Place of supply: ${inv.placeOfSupply}`, M, y, { size: 9, color: MUTED });
  y -= 22;

  // Line items
  const cols = { desc: M, sac: M + 300, rate: M + 360, amt: M + W };
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 20, color: rgb(0.96, 0.97, 0.96) });
  text(page, "Description", cols.desc + 6, y, { size: 9, f: bold });
  text(page, "SAC", cols.sac, y, { size: 9, f: bold });
  text(page, "GST", cols.rate, y, { size: 9, f: bold });
  text(page, "Taxable value", cols.amt - 6, y, { size: 9, f: bold, right: true });
  y -= 22;
  for (const l of inv.lines) {
    const lines = wrap(safe(l.description), font, 9.5, 280);
    lines.forEach((ln, i) => text(page, ln, cols.desc + 6, y - i * 12, { size: 9.5 }));
    text(page, l.sac, cols.sac, y, { size: 9.5 });
    text(page, `${l.gstRateBps / 100}%`, cols.rate, y, { size: 9.5 });
    text(page, inr(l.taxablePaise), cols.amt - 6, y, { size: 9.5, right: true });
    y -= Math.max(lines.length, 1) * 12 + 10;
  }
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE });
  y -= 18;

  // Totals
  const rate = inv.lines[0]?.gstRateBps ?? 0;
  const rows: [string, number][] = [["Taxable value", inv.taxablePaise]];
  if (inv.igstPaise) rows.push([`IGST @ ${rate / 100}%`, inv.igstPaise]);
  else {
    rows.push([`CGST @ ${rate / 200}%`, inv.cgstPaise]);
    rows.push([`SGST @ ${rate / 200}%`, inv.sgstPaise]);
  }
  for (const [k, v] of rows) {
    text(page, k, M + W - 180, y, { size: 10, color: MUTED });
    text(page, inr(v), M + W - 6, y, { size: 10, right: true });
    y -= 16;
  }
  page.drawLine({ start: { x: M + W - 190, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 0.8, color: LINE });
  y -= 8;
  text(page, inv.kind === "credit_note" ? "Total credited" : "Total", M + W - 180, y, { size: 12, f: bold });
  text(page, inr(inv.totalPaise), M + W - 6, y, { size: 12, f: bold, right: true });
  y -= 18;
  if (inv.kind === "invoice") {
    const status = inv.status === "paid" ? `Paid on ${date(inv.paidAt)}` : inv.status === "cancelled" ? "Cancelled by credit note" : "Payment due";
    text(page, status, M + W - 6, y, { size: 10, f: bold, color: inv.status === "paid" ? BRANDC : rgb(0.6, 0.17, 0.12), right: true });
    y -= 30;
  }

  if (inv.kind === "invoice" && inv.status === "unpaid" && opts.bankDetails) {
    text(page, "PAY BY BANK TRANSFER", M, y, { size: 8, f: bold, color: MUTED });
    y -= 14;
    for (const ln of opts.bankDetails.split("\n").flatMap((l) => wrap(safe(l), font, 9.5, W))) {
      text(page, ln, M, y, { size: 9.5 });
      y -= 13;
    }
    text(page, `Please quote ${inv.number} as the payment reference.`, M, y, { size: 9.5, color: MUTED });
  }

  text(page, "This is a computer-generated document and does not need a signature.", M, M - 10, { size: 8, color: MUTED });
  return pdf.save();
}
