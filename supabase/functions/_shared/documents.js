// Pure rendering shared by the studio, customer invoice page and email worker.
export const htmlEscape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const invoiceNumber = (i) =>
  "BP-" + String(i?.number || 0).padStart(6, "0");
export const jmd = (v) =>
  "JMD " +
  Number(v || 0).toLocaleString("en-JM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function publicHTTPS(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      !["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(u.hostname)
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function invoiceHTML(doc, print = false) {
  const i = doc.invoice,
    b = doc.business || {},
    s = doc.branding || {},
    accent = /^#[0-9a-f]{6}$/i.test(s.invoice_accent)
      ? s.invoice_accent
      : "#183d3c",
    logo = publicHTTPS(s.invoice_logo),
    balance = ["void", "refunded"].includes(i.status)
      ? 0
      : Math.max(0, Number(i.total) - Number(i.paid));
  return `<article class="invoice-sheet" style="--invoice-accent:${accent};background:#fff;color:#20383c;padding:36px;font:14px/1.65 Arial,sans-serif;max-width:820px;margin:auto"><header style="display:flex;justify-content:space-between;gap:25px;border-bottom:3px solid ${accent};padding-bottom:24px"><div>${logo ? `<img src="${htmlEscape(logo)}" alt="${htmlEscape(b.name)}" style="max-width:160px;max-height:80px;object-fit:contain">` : ""}<h2 style="font:28px Georgia;margin:10px 0">${htmlEscape(b.name || "Beauty Plus")}</h2><p>${htmlEscape(b.address)}<br>${htmlEscape(b.phone)} · ${htmlEscape(b.email)}</p></div><div style="text-align:right"><span style="letter-spacing:3px;font-size:11px">INVOICE</span><h2>${invoiceNumber(i)}</h2><p>${new Date(i.created_at).toLocaleDateString("en-JM", { timeZone: "America/Jamaica" })}<br><strong>${htmlEscape(i.status.toUpperCase())}</strong></p></div></header><div style="display:flex;justify-content:space-between;gap:25px;padding:26px 0"><div><small>BILLED TO</small><h3 style="margin:8px 0">${htmlEscape(i.customer_name)}</h3><div>${htmlEscape(i.customer_email)}<br>${htmlEscape(i.customer_phone)}</div></div><div style="text-align:right"><small>${htmlEscape(i.source_kind === "booking" ? "APPOINTMENT" : "REFERENCE")}</small><p>${htmlEscape(doc.request?.date || doc.order?.delivery?.name || i.source_kind)} ${htmlEscape(doc.request?.time || "")}</p></div></div><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr style="background:#f1f4ef"><th style="padding:12px">Description</th><th style="padding:12px;text-align:right">Qty</th><th style="padding:12px;text-align:right">Unit price</th><th style="padding:12px;text-align:right">Amount</th></tr></thead><tbody>${i.items.map((l) => `<tr><td style="padding:15px 12px;border-bottom:1px solid #e8ede8">${htmlEscape(l.name)}</td><td style="padding:15px 12px;text-align:right">${l.quantity}</td><td style="padding:15px 12px;text-align:right">${jmd(l.unit_price)}</td><td style="padding:15px 12px;text-align:right">${jmd(l.line_total)}</td></tr>`).join("")}</tbody></table><div style="max-width:340px;margin:25px 0 25px auto">${[
    ["Subtotal", i.subtotal],
    ["Tax", i.tax],
    ["Discount", -Number(i.discount)],
    ["Delivery", i.delivery_fee],
    ["Invoice total", i.total],
    ["Payments received", i.paid],
    ["Refunded", i.refunded],
    ["Outstanding balance", balance],
  ]
    .map(
      ([label, v]) =>
        `<div style="display:flex;justify-content:space-between;gap:20px;padding:7px 0;${["Invoice total", "Outstanding balance"].includes(label) ? "font-weight:bold;border-top:1px solid #dce4dd" : ""}"><span>${label}</span><span>${jmd(v)}</span></div>`,
    )
    .join(
      "",
    )}</div>${Number(i.due_now) > 0 && balance > 0 ? `<p style="padding:15px;background:#f3efdf"><strong>Requested now: ${jmd(Math.min(balance, i.due_now))}</strong><br>The outstanding balance includes any amount due after your deposit.</p>` : ""}${doc.order?.address ? `<p><strong>Delivery address</strong><br>${htmlEscape(doc.order.address)}</p>` : ""}<footer style="border-top:1px solid #e1e7e0;padding-top:20px;font-size:12px;color:#71817b"><p>${htmlEscape(s.invoice_footer || "Thank you for choosing Beauty Plus.")}</p>${i.source_kind === "store" && s.receipt_message ? `<p>${htmlEscape(s.receipt_message)}</p>` : ""}<p>${htmlEscape(b.cancellation_policy || "")}</p><p>Payments are confirmed by the salon. An unpaid invoice is not proof of payment.</p></footer></article>`;
}
export function fillTemplate(text, doc) {
  const i = doc.invoice,
    b = doc.business || {};
  const vars = {
    customer_name: i.customer_name,
    business_name: b.name || "Beauty Plus",
    invoice_number: invoiceNumber(i),
    total: jmd(i.total),
    due: jmd(Math.max(0, i.total - i.paid)),
    appointment_date: [doc.request?.date, doc.request?.time]
      .filter(Boolean)
      .join(" · "),
    status: doc.request?.status || doc.order?.status || i.status,
  };
  return String(text || "").replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, key) => vars[key] ?? "",
  );
}
export function emailHTML(doc, t, invoiceURL) {
  const b = doc.business || {},
    s = doc.branding || {},
    i = doc.invoice,
    accent = /^#[0-9a-f]{6}$/i.test(s.email_accent)
      ? s.email_accent
      : "#183d3c",
    logo = publicHTTPS(s.email_logo || s.invoice_logo);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:28px 12px;background:#f5f5ef;color:#203a3f;font-family:Arial,sans-serif"><table role="presentation" style="max-width:620px;width:100%;margin:auto;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden"><tr><td style="background:${accent};padding:36px;color:white">${logo ? `<img src="${htmlEscape(logo)}" alt="${htmlEscape(b.name)}" style="max-width:160px;max-height:75px;object-fit:contain;background:white;border-radius:7px;padding:8px">` : ""}<p style="font-size:10px;letter-spacing:3px;margin:18px 0">${htmlEscape(b.name || "BEAUTY PLUS")}</p><h1 style="font:34px/1.2 Georgia,serif;margin:12px 0">${htmlEscape(fillTemplate(t.heading, doc))}</h1></td></tr><tr><td style="padding:32px"><div style="font-size:15px;line-height:1.85;white-space:pre-line">${htmlEscape(fillTemplate(t.body, doc)).replace(/\\n/g, "\n")}</div><table role="presentation" style="width:100%;background:#f6f5ee;margin:26px 0;border-radius:10px"><tr><td style="padding:22px"><small style="color:#8b917c">${invoiceNumber(i)}</small><h2 style="font:28px Georgia;margin:10px 0">${jmd(i.total)}</h2><p style="font-size:12px">Status: ${htmlEscape(i.status)} · Outstanding: ${jmd(Math.max(0, i.total - i.paid))}</p></td></tr></table><p style="text-align:center"><a href="${htmlEscape(invoiceURL)}" style="display:inline-block;padding:15px 25px;border-radius:7px;background:${accent};color:white;text-decoration:none;font-size:13px">View your invoice</a></p><p style="font-size:12px;line-height:1.8;color:#7a887d">${htmlEscape(fillTemplate(t.footer, doc))}</p></td></tr><tr><td style="padding:24px 32px;background:#f6f6f0;font-size:11px;color:#74827b;line-height:1.8">${htmlEscape(b.name)}<br>${htmlEscape(b.address)}<br><a href="mailto:${htmlEscape(s.email_reply_to || b.email)}">${htmlEscape(s.email_reply_to || b.email)}</a> · ${htmlEscape(b.phone)}</td></tr></table></body></html>`;
}
