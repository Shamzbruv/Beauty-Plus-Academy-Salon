import { esc, safeURL, date } from "./core.js";
import { saleTotals, round } from "./pos-model.js";
export const cash = (v) =>
  "JMD " +
  Number(v || 0).toLocaleString("en-JM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const paths = {
  bag: "M6 7h12l2 14H4L6 7Zm3 0V5a3 3 0 0 1 6 0v2",
  pause: "M8 5v14M16 5v14",
  receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6M9 12h6",
  till: "M4 10h16v11H4V10Zm2 0V3h12v7M8 15h8M9 6h6",
  back: "m11 5-7 7 7 7M4 12h16",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  scan: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8v8M12 8v8M16 8v8",
  user: "M5 21v-2a7 7 0 0 1 14 0v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5",
  check: "m5 12 4 4L20 5",
  card: "M3 5h18v14H3V5ZM3 10h18M7 15h3",
  bank: "m3 8 9-5 9 5H3Zm3 3v7m6-7v7m6-7v7M3 21h18",
  cash: "M2 5h20v14H2V5Zm14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  split: "M12 3v7M5 21v-6h14v6M12 10v5",
  help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0",
  close: "m6 6 12 12M18 6 6 18",
  refresh: "M20 8a8 8 0 1 0 0 8M20 3v5h-5",
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.bag}"/></svg>`;
export const button = (label, action, cls = "", extra = "") =>
  `<button type="button" class="${cls}" data-pos="${action}" ${extra}>${label}</button>`;
const input = (id, label, value = "", extra = "") =>
  `<label class="pos-field">${label}<input id="${id}" name="${id}" value="${esc(value)}" ${extra}></label>`;
export { input };
export function renderTerminal(s) {
  const open = s.shifts.find((x) => !x.closed_at),
    owner = s.context.is_admin;
  const totals = saleTotals(s.products, s.cart, s.discount);
  const catalog = s.products.filter(
    (p) =>
      (!s.category || p.category === s.category) &&
      (!s.stockOnly || !p.track_stock || p.stock_qty > 0) &&
      [p.name, p.sku, p.barcode]
        .join(" ")
        .toLowerCase()
        .includes(s.search.toLowerCase()),
  );
  const back = owner ? "dashboard" : s.context.can_book ? "desk" : "orders";
  return `<div class="pos-terminal"><header class="pos-topbar"><a class="pos-brand" href="/admin/#${back}" aria-label="Beauty Plus studio"><span class="pos-brand-mark">b<span>+</span></span><span><strong>Beauty Plus</strong><small>POINT OF SALE</small></span></a><div class="pos-register-status"><span class="pos-connection ${navigator.onLine ? "" : "is-offline"}">${navigator.onLine ? "Online" : "Offline"}</span><span class="pos-till-pill ${open ? "is-open" : ""}">${open ? "Till open" : "Till closed"}</span><span class="pos-operator">${esc(s.context.staff?.name || "Owner register")}</span></div><div class="pos-top-actions">${button(icon("refresh"), "refresh", "pos-icon-button", 'aria-label="Refresh stock" title="Refresh stock"')}${button(icon("help"), "help", "pos-icon-button", 'aria-label="POS help"')}${button(icon("expand"), "fullscreen", "pos-icon-button", 'aria-label="Toggle full screen"')}<a class="pos-exit" href="/admin/#${back}">${icon("back")}<span>Back to studio</span></a></div></header>${!navigator.onLine ? '<div class="pos-offline">Connection lost. Reconnect before taking payment. Your basket is kept on this tab.</div>' : ""}<div class="pos-workspace"><nav class="pos-rail" aria-label="Register navigation">${[
    ["sell", "bag", "Sell"],
    ["held", "pause", "Held"],
    ["sales", "receipt", "Sales"],
    ["till", "till", "Till"],
  ]
    .map(([view, i, title]) =>
      button(
        icon(i) +
          `<span>${title}${view === "held" && s.held.length ? " " + s.held.length : ""}</span>`,
        "view",
        "pos-rail-button " + (s.view === view ? "active" : ""),
        `data-view="${view}" aria-label="${title}"`,
      ),
    )
    .join(
      "",
    )}<span class="pos-currency">JMD</span></nav><main class="pos-main" id="pos-main">${s.step === "complete" ? complete(s) : s.view === "sell" ? `<div class="pos-sale-layout ${s.mobileCart ? "show-basket" : ""} ${s.step === "payment" ? "is-payment" : ""}"><section class="pos-selling">${s.step === "payment" ? payment(s, totals) : `<div class="pos-catalog-header"><div><span class="pos-eyebrow">REGISTER</span><h1>New sale</h1></div><small>F2 Search · F4 Charge</small></div><div class="pos-search-wrap">${icon("search")}<input id="pos-search" type="search" placeholder="Search products, SKU or scan barcode" aria-label="Search or scan product" value="${esc(s.search)}" autocomplete="off">${button(icon("scan"), "search-focus", "pos-icon-button", 'aria-label="Focus barcode scanner"')}</div><div class="pos-category-row"><div>${button("All products", "category", !s.category ? "selected" : "", 'data-category=""')}${[...new Set(s.products.map((p) => p.category))].map((c) => button(esc(c), "category", s.category === c ? "selected" : "", `data-category="${esc(c)}"`)).join("")}</div>${button(s.stockOnly ? "In stock ✓" : "In stock", "stock-filter", s.stockOnly ? "selected" : "")}</div><div class="pos-product-grid" id="pos-product-grid">${catalog.length ? catalog.map((p) => `<button class="pos-product" type="button" data-pos="add" data-id="${p.id}" ${p.track_stock && p.stock_qty <= 0 ? "disabled" : ""}><div class="pos-product-photo">${p.image ? `<img src="${esc(safeURL(p.image, true))}" alt="" loading="lazy">` : `<span class="pos-product-monogram">b<span>+</span></span>`}<span class="pos-stock ${p.track_stock && p.stock_qty <= p.low_stock ? "is-low" : ""}">${p.track_stock ? p.stock_qty + " left" : "Available"}</span></div><div class="pos-product-copy"><small>${esc(p.category)}</small><strong>${esc(p.name)}</strong><span>${cash(p.price)}</span></div><span class="pos-product-plus">+</span></button>`).join("") : `<div class="pos-catalog-empty">${icon(s.products.length ? "search" : "bag")}<h2>${s.products.length ? "No matching products" : "Set up your product catalog"}</h2><p>${s.products.length ? "Try a different name, category or barcode." : owner ? "Add your products, prices and stock in the studio. Publish them to make them available at this register." : "Your owner needs to publish products before you can start selling."}</p>${owner && !s.products.length ? '<a class="pos-primary" href="/admin/#products">Add products in the studio →</a>' : ""}</div>`}</div><div class="pos-catalog-footer"><span>${catalog.length} products</span><span>Prices in JMD · tax shown at checkout</span>${button(`View sale (${totals.quantity}) <b>${cash(totals.total)} →</b>`, "mobile-cart", "pos-primary pos-mobile-cart")}</div>`}</section>${basket(s, totals, open)}</div>` : s.view === "held" ? held(s) : s.view === "sales" ? sales(s) : till(s, open)}</main></div></div>`;
}
function basket(s, t, open) {
  return `<aside class="pos-basket"><div class="pos-basket-heading"><div>${button("← Products", "mobile-catalog", "pos-text-button pos-mobile-back")}<span class="pos-eyebrow">CURRENT SALE</span><h2>Sale summary <span>${t.quantity}</span></h2></div>${button(icon("close"), "clear", "pos-icon-button", `aria-label="Clear current sale" ${!s.cart.length || s.busy ? "disabled" : ""}`)}</div><button class="pos-customer" data-pos="customer" type="button" ${s.busy ? "disabled" : ""}>${icon("user")}<span><strong>${esc(s.customer.name || "Walk-in customer")}</strong><small>${esc(s.customer.email || "Add customer / email receipt")}</small></span><b>+</b></button><div class="pos-basket-lines">${t.lines.map((l) => `<article class="pos-basket-line ${l.unavailable ? "is-unavailable" : ""}"><div class="pos-line-top"><strong>${esc(l.name)}</strong>${button("×", "remove", "pos-remove", `data-id="${l.id}" aria-label="Remove ${esc(l.name)}" ${s.step === "payment" ? "disabled" : ""}`)}</div><small>${l.unavailable ? "Remove this item before payment" : cash(l.price) + " each" + (Number(l.tax_rate) > 0 ? " + tax" : "")}</small><div class="pos-line-bottom"><div class="pos-quantity">${button("−", "minus", "", `data-id="${l.id}" aria-label="Remove one ${esc(l.name)}" ${s.step === "payment" ? "disabled" : ""}`)}<input inputmode="numeric" type="number" min="1" max="999" data-quantity="${l.id}" value="${l.qty}" aria-label="Quantity for ${esc(l.name)}" ${s.step === "payment" ? "disabled" : ""}>${button("+", "add", "", `data-id="${l.id}" aria-label="Add one ${esc(l.name)}" ${s.step === "payment" ? "disabled" : ""}`)}</div><b>${cash(l.net)}</b></div></article>`).join("") || `<div class="pos-basket-empty">${icon("bag")}<h3>Your sale starts here</h3><p>Tap a product or scan its barcode.</p></div>`}</div><div class="pos-basket-bottom"><dl><div><dt>Subtotal</dt><dd>${cash(t.subtotal)}</dd></div><div><dt>Tax</dt><dd>${cash(t.tax)}</dd></div>${t.discount ? `<div><dt>Discount</dt><dd>− ${cash(t.discount)}</dd></div>` : ""}<div class="pos-total"><dt>Total</dt><dd class="pos-grand">${cash(t.total)}</dd></div></dl>${s.step === "payment" ? button("← Edit this sale", "edit-sale", "pos-secondary pos-wide", s.busy ? "disabled" : "") : button(!open ? "Open till to take payment" : `Charge ${cash(t.total)} <span>→</span>`, !open ? "open-till" : "pay", "pos-primary pos-wide", `${(!s.cart.length && open) || t.lines.some((l) => l.unavailable) || !navigator.onLine || s.busy ? "disabled" : ""} data-testid="pos-charge"`)}<div class="pos-basket-actions">${button(icon("pause") + " Hold sale", "hold", "pos-text-button", `${!s.cart.length || s.step === "payment" ? "disabled" : ""}`)}${button("Clear basket", "clear", "pos-text-button", `${!s.cart.length || s.step === "payment" ? "disabled" : ""}`)}</div><p>Stock and prices are verified when you complete the sale.</p></div></aside>`;
}
function payment(s, t) {
  const p = s.payment,
    split = p.method === "split",
    cashPart = split ? Number(p.cash || 0) : p.method === "cash" ? t.total : 0;
  const applied = round(
    Number(p.cash || 0) + Number(p.card || 0) + Number(p.bank || 0),
  );
  const received = Number(p.received || 0),
    change = cashPart > 0 ? Math.max(0, round(received - cashPart)) : 0;
  const needsConfirm =
    p.method === "card" ||
    p.method === "bank" ||
    (split && (Number(p.card) > 0 || Number(p.bank) > 0));
  return `<section class="pos-payment"><div class="pos-payment-header">${button("← Back to products", "edit-sale", "pos-text-button", s.busy ? "disabled" : "")}<span class="pos-eyebrow">TAKE PAYMENT</span><h1>How is your customer paying?</h1><div class="pos-mobile-due"><span>Amount due</span><strong>${cash(t.total)}</strong></div></div><form id="pos-payment-form"><fieldset ${s.busy ? "disabled" : ""}><div class="pos-methods">${[
    ["cash", "cash", "Cash"],
    ["card", "card", "Card"],
    ["bank", "bank", "Transfer"],
    ["split", "split", "Split"],
  ]
    .map(([m, i, label]) =>
      button(
        icon(i) + `<span>${label}</span>`,
        "method",
        p.method === m ? "selected" : "",
        `data-method="${m}" ${s.busy ? "disabled" : ""}`,
      ),
    )
    .join(
      "",
    )}</div><div class="pos-payment-grid"><div class="pos-tender-details">${s.context.is_admin || s.context.staff?.can_discount ? input("pos-discount", "Sale discount (JMD)", s.discountText ?? String(s.discount), 'inputmode="decimal" autocomplete="off"') : ""}${split ? `<div class="pos-split-amounts">${input("pos-cash", "Cash portion (JMD)", p.cash, 'inputmode="decimal"')}${input("pos-card", "Card portion (JMD)", p.card, 'inputmode="decimal"')}${input("pos-bank", "Transfer portion (JMD)", p.bank, 'inputmode="decimal"')}</div><p class="pos-split-balance ${Math.abs(t.total - applied) < 0.005 ? "is-balanced" : ""}">${cash(t.total - applied)} ${applied > t.total ? "overpaid" : "remaining to allocate"}</p>` : ""}${
    p.method === "cash" || split
      ? `${input("pos-received", "Cash received (JMD)", p.received, 'inputmode="decimal" autocomplete="off" placeholder="0.00"')}<div class="pos-cash-presets">${[
          cashPart,
          ...[1000, 2000, 5000, 10000].filter((v) => v > cashPart),
        ]
          .slice(0, 4)
          .map((v, k) =>
            button(
              k === 0 ? "Exact amount" : v.toLocaleString(),
              "cash-preset",
              "",
              `data-value="${v}"`,
            ),
          )
          .join(
            "",
          )}</div><div class="pos-change"><span>Change to give</span><strong id="cash-change">${cash(change)}</strong></div>`
      : `<div class="pos-external-note">${icon(p.method === "card" ? "card" : "bank")}<strong>${p.method === "card" ? "Use your card terminal" : "Verify the bank transfer"}</strong><p>Complete the payment outside this screen, then confirm it below. This register records the result.</p></div>`
  }${needsConfirm ? input("pos-reference", "Payment reference (optional)", p.reference, 'maxlength="200"') : ""}${needsConfirm ? `<label class="pos-confirm"><input id="pos-confirmed" type="checkbox" ${p.confirmed ? "checked" : ""}>I have confirmed the card / bank payment succeeded.</label>` : ""}</div><div class="pos-keypad"><span class="pos-eyebrow">${p.method === "cash" || split ? "CASH / AMOUNT KEYPAD" : "PAYMENT SUMMARY"}</span>${p.method === "cash" || split ? `<div class="pos-number-grid">${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => button(key, "key", "", `data-key="${key}" aria-label="${key === "⌫" ? "Delete last digit" : key}"`)).join("")}</div>${button("Clear amount", "clear-amount", "pos-text-button")}` : `<strong class="pos-payment-due">${cash(t.total)}</strong><p>${esc(s.customer.name || "Walk-in customer")}</p><small>${t.quantity} item${t.quantity === 1 ? "" : "s"}</small>`}</div></div>${s.error ? `<p class="pos-form-error" role="alert">${esc(s.error)}</p>` : ""}<button class="pos-primary pos-complete-button" type="submit" ${s.busy || !navigator.onLine ? "disabled" : ""}>${s.busy ? "Saving sale…" : `Complete sale · ${cash(t.total)}`}</button><p class="pos-payment-hint">An invoice is created with every completed sale.</p></fieldset></form></section>`;
}
function held(s) {
  return `<section class="pos-list-page"><div class="pos-page-heading"><span class="pos-eyebrow">PAUSED BASKETS</span><h1>Held sales</h1><p>Pick up where you left off. Stock is checked again when you take payment.</p></div><div class="pos-held-grid">${s.held.map((h) => `<article class="pos-held-card">${icon("pause")}<h2>${esc(h.label)}</h2><p>${date(h.created_at)}</p><small>${(Array.isArray(h.cart) ? h.cart : h.cart?.items || []).reduce((n, i) => n + Number(i.qty || 0), 0)} items</small>${button("Resume sale →", "resume", "pos-primary", `data-id="${h.id}"`)}</article>`).join("") || '<div class="pos-page-empty"><h2>No held sales</h2><p>Use Hold sale to pause a basket while you help another customer.</p></div>'}</div></section>`;
}
function sales(s) {
  return `<section class="pos-list-page"><div class="pos-page-heading"><span class="pos-eyebrow">RECENT TRANSACTIONS</span><h1>Sales & receipts</h1><p>Latest 100 online and counter orders. Open a receipt or review the sale.</p></div><div class="pos-table-wrap"><table><thead><tr><th>Sale</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${s.orders.map((o) => `<tr><td><strong>BP-${String(o.number).padStart(6, "0")}</strong><small>${date(o.created_at)} · ${o.channel}</small></td><td>${esc(o.customer_name)}</td><td><b>${cash(o.total)}</b></td><td><span class="pos-status-tag">${esc(o.status)}</span></td><td>${button("View receipt", "receipt", "pos-secondary", `data-id="${o.id}"`)}</td></tr>`).join("") || '<tr><td colspan="5">Completed sales and new online orders will appear here.</td></tr>'}</tbody></table></div>${s.context.is_admin ? '<a class="pos-inline-link" href="/admin/#orders">Open fulfilment, returns & refunds in the studio →</a>' : ""}</section>`;
}
function till(s, open) {
  return `<section class="pos-list-page pos-till-page"><div class="pos-page-heading"><span class="pos-eyebrow">YOUR CASH DRAWER</span><h1>Till management</h1><p>Open with your starting cash. Close with the amount you actually count.</p></div><article class="pos-till-card"><div>${icon("till")}<h2>${open ? "Your till is open" : "Ready to open your till?"}</h2><p>${open ? "Opened " + date(open.opened_at) : "Count the cash in your drawer before you start."}</p>${open ? `<strong>${cash(open.opening_cash)}</strong><small>Opening cash</small>` : ""}</div>${button(open ? "Close & count till" : "Open till", open ? "close-till" : "open-till", "pos-primary")}</article>${s.shiftResult ? `<div class="pos-reconciliation"><h2>Till closed</h2><p>Expected ${cash(s.shiftResult.expected_cash)} · Counted ${cash(s.shiftResult.counted_cash)}</p><strong>Difference ${cash(s.shiftResult.counted_cash - s.shiftResult.expected_cash)}</strong></div>` : ""}<h2 class="pos-subheading">Your recent tills</h2><div class="pos-table-wrap"><table><thead><tr><th>Opened</th><th>Opening cash</th><th>Closed</th><th>Difference</th></tr></thead><tbody>${
    s.shifts
      .filter((t) => t.closed_at)
      .map(
        (t) =>
          `<tr><td>${date(t.opened_at)}</td><td>${cash(t.opening_cash)}</td><td>${date(t.closed_at)}</td><td>${cash(t.counted_cash - t.expected_cash)}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="4">Closed tills will appear here.</td></tr>'
  }</tbody></table></div></section>`;
}
function complete(s) {
  return `<section class="pos-completion"><div class="pos-completion-copy"><span class="pos-success-mark">${icon("check")}</span><span class="pos-eyebrow">${s.receiptMode === "history" ? "SALE DETAILS" : "PAYMENT RECORDED"}</span><h1>${s.receiptMode === "history" ? "Your sale receipt" : "Sale complete"}</h1><strong class="pos-completion-total">${cash(s.document?.invoice.total ?? s.result?.total)}</strong>${s.receiptMode !== "history" ? `<div class="pos-completion-change"><span>Change to give</span><strong>${cash(s.result?.change)}</strong></div>` : ""}<p>${s.document?.invoice.customer_email ? "The invoice is available now. Email delivery follows your salon’s configured email settings." : "Print the receipt or download the invoice for your customer."}</p><div class="pos-completion-actions">${button("Start new sale →", "new-sale", "pos-primary")}${button("Print receipt", "print", "pos-secondary", !s.document ? "disabled" : "")}${button("Download invoice PDF", "pdf", "pos-secondary", !s.document ? "disabled" : "")}${!s.document ? button("Load receipt", "load-receipt", "pos-secondary") : ""}</div>${s.error ? `<p class="pos-form-error">${esc(s.error)}</p>` : ""}</div><div class="pos-receipt-holder">${s.document ? receipt(s) : "<p>Loading the saved invoice…</p>"}</div></section>`;
}
function receipt(s) {
  const i = s.document.invoice,
    b = s.document.business || {},
    brand = s.document.branding || {};
  return `<article class="pos-paper-receipt" id="pos-paper-receipt"><header><h2>${esc(b.name || "Beauty Plus")}</h2><p>${esc(b.address)}<br>${esc(b.phone)}</p><strong>BP-${String(i.number).padStart(6, "0")}</strong><p>${date(i.created_at)}<br>${esc(i.customer_name)}</p></header><div class="pos-receipt-items">${i.items.map((l) => `<div><strong>${esc(l.name)}</strong><p><span>${l.quantity} × ${cash(l.unit_price)}</span><b>${cash(l.line_total)}</b></p></div>`).join("")}</div><dl>${[
    ["Subtotal", i.subtotal],
    ["Tax", i.tax],
    ["Discount", -Number(i.discount)],
    ["Delivery", i.delivery_fee],
    ["TOTAL", i.total],
    ["Paid", i.paid],
    ["Refunded", i.refunded],
  ]
    .map(([l, v]) => `<div><dt>${l}</dt><dd>${cash(v)}</dd></div>`)
    .join(
      "",
    )}${s.receiptMode !== "history" ? `<div><dt>Change</dt><dd>${cash(s.result?.change)}</dd></div>` : ""}</dl><footer><strong>${esc(i.status.toUpperCase())}</strong><p>${esc(brand.receipt_message || "Thank you for shopping with Beauty Plus.")}</p><small>An unpaid invoice is not proof of payment.</small></footer></article>`;
}
