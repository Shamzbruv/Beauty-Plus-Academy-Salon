import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { regular as regularData, bold as boldData } from "./invoice-fonts.js";
import { invoiceNumber, jmd, publicHTTPS } from "./documents.js";

export async function invoicePDF(doc) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const regular = await pdf.embedFont(decode(regularData));
  const bold = await pdf.embedFont(decode(boldData));
  const i = doc.invoice,
    b = doc.business || {},
    s = doc.branding || {};
  const hex = /^#[0-9a-f]{6}$/i.test(s.invoice_accent)
    ? s.invoice_accent
    : "#183d3c";
  const accent = rgb(
    ...[1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16) / 255),
  );
  const ink = rgb(0.13, 0.23, 0.25),
    muted = rgb(0.43, 0.5, 0.47),
    pale = rgb(0.95, 0.96, 0.93);
  const clean = (v) =>
    String(v ?? "")
      .normalize("NFKD")
      .replace(/[^\x20-\x7e\n]/g, " ");
  let page, y;
  function text(
    value,
    x,
    baseline,
    size = 10,
    strong = false,
    color = ink,
    right = false,
  ) {
    const font = strong ? bold : regular,
      valueText = clean(value);
    page.drawText(valueText, {
      x: right ? x - font.widthOfTextAtSize(valueText, size) : x,
      y: baseline,
      size,
      font,
      color,
    });
  }
  function newPage() {
    page = pdf.addPage([595, 842]);
    y = 786;
    page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: accent });
    if (pdf.getPageCount() > 1) {
      text(b.name || "Beauty Plus", 42, y, 12, true, accent);
      text(invoiceNumber(i) + " / continued", 553, y, 9, false, muted, true);
      y -= 34;
    }
  }
  function room(height) {
    if (y - height < 65) newPage();
  }
  function lines(value, width, size = 10, strong = false) {
    const font = strong ? bold : regular,
      result = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) result.push(line);
        line = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width) {
            result.push(line);
            line = "";
          }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  function paragraph(
    value,
    size = 10,
    color = muted,
    width = 510,
    strong = false,
  ) {
    for (const line of lines(value, width, size, strong)) {
      room(size + 5);
      text(line, 42, y, size, strong, color);
      y -= size + 5;
    }
  }
  newPage();
  const logo = publicHTTPS(s.invoice_logo);
  if (logo) {
    try {
      const r = await fetch(logo, { signal: AbortSignal.timeout(6000) });
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (r.ok && bytes.length < 2000000) {
        const type = r.headers.get("content-type") || "";
        const image = type.includes("png")
          ? await pdf.embedPng(bytes)
          : type.includes("jpeg")
            ? await pdf.embedJpg(bytes)
            : null;
        if (image) {
          const d = image.scaleToFit(130, 60);
          page.drawImage(image, {
            x: 42,
            y: y - d.height,
            width: d.width,
            height: d.height,
          });
          y -= d.height + 18;
        }
      }
    } catch {}
  }
  paragraph(b.name || "Beauty Plus Academy & Salon", 21, accent, 510, true);
  y -= 5;
  paragraph(b.address || "", 9);
  paragraph([b.phone, b.email].filter(Boolean).join(" | "), 9);
  y -= 24;
  text("INVOICE", 42, y, 10, true, muted);
  text(invoiceNumber(i), 553, y, 21, true, accent, true);
  y -= 25;
  text(
    "Issued " +
      new Date(i.created_at).toLocaleDateString("en-JM", {
        timeZone: "America/Jamaica",
      }),
    42,
    y,
    9,
    false,
    muted,
  );
  text(i.status.toUpperCase(), 553, y, 10, true, accent, true);
  y -= 24;
  page.drawLine({
    start: { x: 42, y },
    end: { x: 553, y },
    thickness: 1,
    color: pale,
  });
  y -= 25;
  paragraph("BILLED TO", 8, muted, 510, true);
  paragraph(i.customer_name, 12, ink, 510, true);
  if (i.customer_email) paragraph(i.customer_email, 10);
  if (i.customer_phone) paragraph(i.customer_phone, 10);
  if (doc.request?.date)
    paragraph(
      "Appointment: " + doc.request.date + " " + (doc.request.time || ""),
      10,
    );
  if (doc.order?.delivery?.name)
    paragraph("Delivery: " + doc.order.delivery.name, 10);
  if (doc.order?.address) paragraph(doc.order.address, 10);
  y -= 22;
  function tableHead() {
    room(35);
    page.drawRectangle({
      x: 42,
      y: y - 9,
      width: 511,
      height: 28,
      color: pale,
    });
    text("DESCRIPTION", 53, y, 8, true, accent);
    text("QTY", 343, y, 8, true, accent, true);
    text("UNIT PRICE", 443, y, 8, true, accent, true);
    text("AMOUNT", 542, y, 8, true, accent, true);
    y -= 34;
  }
  tableHead();
  for (const item of i.items || []) {
    const description = lines(item.name, 265, 10);
    const rowHeight = description.length * 15 + 16;
    if (y - Math.min(rowHeight, 630) < 65) {
      newPage();
      tableHead();
    }
    text(item.quantity, 343, y, 10, false, ink, true);
    text(jmd(item.unit_price), 443, y, 9, false, ink, true);
    text(jmd(item.line_total), 542, y, 9, true, ink, true);
    for (const line of description) {
      if (y < 80) {
        newPage();
        tableHead();
      }
      text(line, 53, y, 10);
      y -= 15;
    }
    y -= 8;
    page.drawLine({
      start: { x: 42, y },
      end: { x: 553, y },
      thickness: 0.5,
      color: pale,
    });
    y -= 12;
  }
  y -= 10;
  room(215);
  const outstanding = ["void", "refunded"].includes(i.status)
    ? 0
    : Math.max(0, Number(i.total) - Number(i.paid));
  for (const [label, value] of [
    ["Subtotal", i.subtotal],
    ["Tax", i.tax],
    ["Discount", -Number(i.discount)],
    ["Delivery", i.delivery_fee],
    ["INVOICE TOTAL", i.total],
    ["Payments received", i.paid],
    ["Refunded", i.refunded],
    ["OUTSTANDING", outstanding],
  ]) {
    const strong = label === "INVOICE TOTAL" || label === "OUTSTANDING";
    if (strong) {
      page.drawRectangle({
        x: 278,
        y: y - 7,
        width: 275,
        height: 24,
        color: pale,
      });
    }
    text(label, 288, y, 9, strong, strong ? accent : muted);
    text(jmd(value), 542, y, 10, strong, strong ? accent : ink, true);
    y -= 25;
  }
  y -= 14;
  if (outstanding > 0 && i.due_now > 0) {
    room(50);
    paragraph(
      "Requested now: " + jmd(Math.min(outstanding, i.due_now)),
      11,
      accent,
      510,
      true,
    );
    paragraph(
      "The remaining balance includes any amount due after your deposit.",
      9,
    );
    y -= 12;
  }
  paragraph(s.invoice_footer || "Thank you for choosing Beauty Plus.", 10, ink);
  if (i.source_kind === "store" && s.receipt_message)
    paragraph(s.receipt_message, 9);
  paragraph(b.cancellation_policy || "", 9);
  paragraph("An unpaid invoice is not proof of payment.", 8);
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    page = p;
    text(invoiceNumber(i), 42, 32, 8, false, muted);
    text(`${index + 1} / ${pages.length}`, 553, 32, 8, false, muted, true);
  });
  pdf.setTitle(invoiceNumber(i));
  pdf.setAuthor(b.name || "Beauty Plus");
  return pdf.save();
}
