import jsPDF from "jspdf";
import { formatMoney, type Currency } from "./money";

export type InvoicePdfData = {
  number: string;
  biller_name: string;
  client_name: string;
  client_email?: string | null;
  currency: Currency;
  due_date: string;
  status: string;
  subtotal_minor: number;
  tax_setaside_percent: number;
  notes?: string | null;
  items: { description: string; quantity: number; unit_price_minor: number }[];
  share_url: string;
};

export function downloadInvoicePdf(inv: InvoicePdfData) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text("INVOICE", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(inv.number, margin, y + 16);

  // Sandbox stamp
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(6, 182, 212);
  doc.text("SANDBOX · Smart Pay Engine", pageW - margin, y, { align: "right" });
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.text(`Status: ${inv.status.toUpperCase()}`, pageW - margin, y + 14, { align: "right" });
  doc.text(`Due: ${inv.due_date}`, pageW - margin, y + 28, { align: "right" });

  y += 60;

  // Parties
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("FROM", margin, y);
  doc.text("BILLED TO", pageW / 2, y);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text(inv.biller_name, margin, y + 16);
  doc.text(inv.client_name, pageW / 2, y + 16);
  doc.setFont("helvetica", "normal");
  if (inv.client_email) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(inv.client_email, pageW / 2, y + 30);
  }
  y += 60;

  // Table header
  const colDesc = margin;
  const colQty = pageW - margin - 240;
  const colUnit = pageW - margin - 140;
  const colTotal = pageW - margin;

  doc.setFillColor(241, 245, 249);
  doc.rect(margin - 4, y - 12, pageW - margin * 2 + 8, 22, "F");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPTION", colDesc, y + 2);
  doc.text("QTY", colQty, y + 2, { align: "right" });
  doc.text("UNIT", colUnit, y + 2, { align: "right" });
  doc.text("TOTAL", colTotal, y + 2, { align: "right" });
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  for (const it of inv.items) {
    const lineTotal = Math.round(Number(it.quantity) * it.unit_price_minor);
    const descLines = doc.splitTextToSize(it.description || "—", colQty - colDesc - 10);
    doc.text(descLines, colDesc, y);
    doc.text(String(Number(it.quantity)), colQty, y, { align: "right" });
    doc.text(formatMoney(it.unit_price_minor, inv.currency), colUnit, y, { align: "right" });
    doc.text(formatMoney(lineTotal, inv.currency), colTotal, y, { align: "right" });
    y += Math.max(18, descLines.length * 14);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y - 6, pageW - margin, y - 6);
  }

  // Totals
  y += 10;
  const setasideMinor = Math.round((inv.subtotal_minor * inv.tax_setaside_percent) / 100);
  const netMinor = inv.subtotal_minor - setasideMinor;

  const totalsX = pageW - margin - 200;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Subtotal", totalsX, y);
  doc.setTextColor(15, 23, 42);
  doc.text(formatMoney(inv.subtotal_minor, inv.currency), colTotal, y, { align: "right" });
  y += 18;

  if (inv.tax_setaside_percent > 0) {
    doc.setTextColor(100);
    doc.text(`Tax reserve (${inv.tax_setaside_percent}%)`, totalsX, y);
    doc.setTextColor(6, 182, 212);
    doc.text(formatMoney(setasideMinor, inv.currency), colTotal, y, { align: "right" });
    y += 16;
    doc.setTextColor(100);
    doc.setFontSize(9);
    doc.text("Net to freelancer wallet", totalsX, y);
    doc.setTextColor(15, 23, 42);
    doc.text(formatMoney(netMinor, inv.currency), colTotal, y, { align: "right" });
    y += 18;
    doc.setFontSize(10);
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1);
  doc.line(totalsX, y, colTotal, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("Amount due", totalsX, y);
  doc.text(formatMoney(inv.subtotal_minor, inv.currency), colTotal, y, { align: "right" });
  y += 30;

  // Notes
  if (inv.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("NOTES", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    const noteLines = doc.splitTextToSize(inv.notes, pageW - margin * 2);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 14 + 10;
  }

  // Pay link
  doc.setFillColor(6, 182, 212);
  doc.roundedRect(margin, y, pageW - margin * 2, 44, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Pay this invoice (Sandbox)", margin + 16, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.textWithLink(inv.share_url, margin + 16, y + 34, { url: inv.share_url });
  y += 60;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Sandbox invoice — no real money moves. Powered by Smart Pay Engine · smartpayengine.com",
    pageW / 2,
    doc.internal.pageSize.getHeight() - 24,
    { align: "center" },
  );

  doc.save(`${inv.number}.pdf`);
}

export function buildInvoiceReminderMailto(inv: {
  number: string;
  client_name: string;
  client_email?: string | null;
  currency: Currency;
  subtotal_minor: number;
  due_date: string;
  biller_name: string;
  share_url: string;
}) {
  const subject = `Reminder: Invoice ${inv.number} — ${formatMoney(inv.subtotal_minor, inv.currency)} due ${inv.due_date}`;
  const body = [
    `Hi ${inv.client_name},`,
    "",
    `A quick reminder that invoice ${inv.number} for ${formatMoney(inv.subtotal_minor, inv.currency)} is due on ${inv.due_date}.`,
    "",
    `You can review and pay it here (sandbox):`,
    inv.share_url,
    "",
    `Thanks,`,
    inv.biller_name,
    "",
    `— Sent via Smart Pay Engine (sandbox)`,
  ].join("\n");
  const to = inv.client_email ?? "";
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
