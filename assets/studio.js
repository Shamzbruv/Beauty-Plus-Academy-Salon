import { invoicePDF } from "./invoice-pdf.js";
import {
  db,
  esc,
  money,
  date,
  safeURL,
  checked,
  toast,
  download,
  csv,
} from "./core.js";
import { invoiceHTML, invoiceNumber } from "./documents.js";
export const command = (action, p = {}) =>
  checked(db.rpc("bp_command", { p_action: action, p }));
export async function business(action, data = {}) {
  const { data: result, error } = await db.functions.invoke("bp-business", {
    body: { action, data },
  });
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  if (result?.error) throw new Error(result.error);
  return result;
}
const $ = (s) => document.querySelector(s),
  uid = () => crypto.randomUUID(),
  round = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const views = [
  "products",
  "deliveries",
  "orders",
  "pos",
  "desk",
  "team",
  "finance",
  "invoices",
  "emails",
  "notifications",
  "account",
  "shop-settings",
];
const titles = {
  products: "Products & inventory",
  deliveries: "Delivery & collection",
  orders: "Store orders",
  pos: "Point of sale",
  desk: "Booking desk",
  team: "Your employees",
  finance: "Financial overview",
  invoices: "Invoices & payments",
  emails: "Emails & branding",
  notifications: "Your notifications",
  account: "My account",
  "shop-settings": "Store & booking settings",
};
const guides = {
  products: [
    "Add each size or colour as its own product with a unique SKU. Optional barcodes make checkout faster.",
    "Set the JMD price, optional tax percentage, private unit cost, stock, and low-stock warning. Published products appear in the store and POS.",
    "Sales and returns update inventory automatically. Stock changes require a reason. Archive to hide a product while preserving its records.",
  ],
  deliveries: [
    "Add collection, local delivery, or shipping. Set a flat fee, an optional free-delivery threshold, covered areas, timing, and instructions.",
    "Only active options appear at checkout. Leave areas blank to allow all areas. Existing orders keep the delivery terms they accepted.",
  ],
  orders: [
    "Review online and POS orders in one list. Payment is checked separately from order fulfilment.",
    "An unpaid cancellation restores stock. Paid orders need a recorded refund and a return reason. Only the owner can issue refunds.",
  ],
  pos: [
    "Open your till with its starting cash. Search a product or scan its barcode into the search box and press Enter.",
    "Tap products, adjust quantities, then Take payment. Cash, external card terminals, bank transfer, and split payments are supported. The cash screen shows change.",
    "Held sales do not reserve stock. Checkout needs an internet connection and confirms current prices and stock on the server.",
    "The owner uses the same POS. Discounts require permission; refunds require the owner. No card details are collected by this app.",
  ],
  desk: [
    "Book customers using the live service menu and available appointment slots. Enter their email to deliver an invoice.",
    "Every booking creates an invoice showing the full service price and deposit requested now. Confirm the appointment and payment separately.",
    "Capacity, opening hours, blackout dates, and employee conflicts are checked by the database.",
  ],
  team: [
    "Create individual employee accounts with an email and a temporary password of at least 12 characters.",
    "Choose booking access, POS access, or both. Discount permission is optional. Staff change their temporary password at first sign-in.",
    "Disabling an employee or resetting their password revokes sessions. Staff cannot access the owner’s financial reports, website settings, or email credentials.",
  ],
  finance: [
    "Graphs use recorded payments and refunds. Pending payment requests are not counted as money received.",
    "Choose a date range to compare bookings, courses, products, events, payment methods, top products, and staff sales.",
    "Outstanding balances cover all open invoices. Product margin is an estimate before discounts and overheads. Export the transaction register for reconciliation.",
  ],
  invoices: [
    "Bookings, course requests, and store orders have linked invoices. A booking invoice shows its full price and deposit; course invoices include tuition and registration.",
    "Record only payments verified with your bank or provider. Refunds require a reason and stay in the audit trail.",
    "Tuition requests with a matching enrollment email and course can share the enrollment invoice.",
  ],
  emails: [
    "Connect a Resend API key and a verified sender. The key is stored on the server and cannot be read back in the browser.",
    "Edit each email’s subject, heading, body, footer, and enabled status. Use the listed placeholders and preview before saving.",
    "Customer emails include an attached PDF invoice and a private invoice link. The log shows queued, sent, blocked, or failed delivery. Sent means the provider accepted it.",
    "Resend creates another delivery record. Branding and wording changes apply to future messages.",
  ],
  notifications: [
    "Click Enable alerts to grant browser notification permission. In-app alerts update live.",
    "Only this admin workspace can be installed as an app. On iPhone/iPad, add it to the Home Screen before enabling push.",
    "Push delivery depends on browser permission and device support. No customer records or payment APIs are cached offline.",
  ],
  account: [
    "Use your own login. Change your password here; never share employee credentials.",
    "The owner controls your permissions. Your sales and bookings are attributed to your account.",
  ],
  "shop-settings": [
    "Set the public store introduction, invoice/receipt branding, and booking hours.",
    "All appointment times use Jamaica time. Capacity means the maximum number of overlapping appointments across the salon.",
    "Set open weekdays and blackout dates. Website bookings and employee bookings use these same settings.",
  ],
};
let context = {},
  operator = null,
  base = () => ({}),
  refreshBase = async () => {},
  state = {
    products: [],
    deliveries: [],
    orders: [],
    invoices: [],
    staff: [],
    shifts: [],
    held: [],
    notifications: [],
    outbox: [],
    templates: [],
    costs: {},
  },
  cart = [],
  cartKey = uid(),
  query = "",
  category = "all",
  orderFilter = "",
  activeView = "",
  financeFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  financeTo = new Date().toISOString().slice(0, 10),
  report = null,
  emailTab = "templates",
  channel = null,
  installPrompt = null,
  syncTimer = null,
  lastNotification = 0;
const settings = () =>
  base().content?.find((r) => r.id === "shop-settings")?.data || {};
const businessSettings = () =>
  base().content?.find((r) => r.id === "site-settings")?.data || {};
const btn = (text, action, primary = false, extra = "") =>
  `<button type="button" class="button ${primary ? "primary" : ""}" data-studio="${action}" ${extra}>${text}</button>`;
const field = (name, label, value = "", type = "text", extra = "") =>
  `<label class="field ${type === "textarea" ? "full" : ""}">${label}${type === "textarea" ? `<textarea name="${name}" ${extra}>${esc(value)}</textarea>` : `<input type="${type}" name="${name}" value="${esc(value)}" ${extra}>`}</label>`;
const select = (name, label, options, value) =>
  `<label class="field">${label}<select name="${name}">${options.map((o) => `<option value="${esc(Array.isArray(o) ? o[0] : o)}" ${value === (Array.isArray(o) ? o[0] : o) ? "selected" : ""}>${esc(Array.isArray(o) ? o[1] : o)}</option>`).join("")}</select></label>`;
const check = (name, label, value) =>
  `<label class="field check"><input name="${name}" type="checkbox" ${value ? "checked" : ""}>${esc(label)}</label>`;
const badge = (v) => `<span class="badge ${esc(v)}">${esc(v)}</span>`;
const header = (title, description, actions = "") =>
  `<div class="heading"><div><span class="eyebrow">BEAUTY PLUS • YOUR BUSINESS IN SYNC</span><div class="heading-title"><h1>${title}</h1><button class="icon-button" data-studio="help" aria-label="About this page">i</button></div><p>${description}</p></div><div class="studio-actions">${actions}</div></div>`;
const empty = (title, text) =>
  `<div class="empty"><h3>${title}</h3><p>${text}</p></div>`;
const filtered = (list) =>
  list.filter((p) =>
    JSON.stringify(p).toLowerCase().includes(query.toLowerCase()),
  );
const catalogue = () => state.products.filter((p) => p.status === "published");
const shift = () =>
  state.shifts.find((s) => s.operator_id === operator?.id && !s.closed_at);
async function all(table, sort = "created_at") {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const data = await checked(
      db
        .from(table)
        .select("*")
        .order(sort, { ascending: false })
        .order("id")
        .range(from, from + 999),
    );
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
function modal(title, body, submit = "Save changes", onSubmit = null) {
  const e = $("#editor");
  e.innerHTML = `<form id="studio-form"><div class="dialog-header"><div><span class="eyebrow">BEAUTY PLUS STUDIO</span><h2>${title}</h2></div><button class="dialog-close" type="button" data-close aria-label="Close">×</button></div><div class="dialog-body">${body}</div><div class="dialog-footer"><button type="button" class="button" data-close>Cancel</button>${submit ? `<button type="submit" class="button primary">${submit}</button>` : ""}</div></form>`;
  if (onSubmit)
    $("#studio-form").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await onSubmit(e.target);
        $("#editor").close();
        await refreshBase();
      } catch (err) {
        toast(err.message, true);
      } finally {
        button.disabled = false;
      }
    };
  e.showModal();
  return e;
}
async function refresh() {
  const owner = context.is_admin;
  const tasks = {
    products: all("bp_products", "updated_at"),
    deliveries: all("bp_deliveries", "updated_at"),
    notifications: all("bp_notifications"),
    shifts: context.can_pos
      ? all("bp_shifts", "opened_at")
      : Promise.resolve([]),
    orders: context.can_pos ? all("bp_orders") : Promise.resolve([]),
    held: context.can_pos ? all("bp_held_carts") : Promise.resolve([]),
    staff: all("bp_staff"),
  };
  if (owner) {
    tasks.invoices = all("bp_invoices");
    tasks.outbox = all("bp_email_outbox");
    tasks.templates = all("bp_email_templates", "updated_at");
    tasks.costs = command("product_costs");
  }
  const entries = await Promise.all(
    Object.entries(tasks).map(async ([k, v]) => [k, await v]),
  );
  Object.assign(state, Object.fromEntries(entries));
  const reads = await checked(
    db.from("bp_notification_reads").select("*").eq("user_id", operator.id),
  );
  lastNotification = Number(reads[0]?.last_id || 0);
  updateBadge();
}
function help() {
  const h = $("#help");
  h.innerHTML = `<div class="dialog-header"><h2>${titles[activeView] || "Studio guide"}</h2><button class="dialog-close" data-close>×</button></div><div class="dialog-body"><ol class="help-list">${(guides[activeView] || guides.pos).map((t) => `<li>${esc(t)}</li>`).join("")}</ol></div>`;
  h.showModal();
}
function productPage() {
  return (
    header(
      "Your beauty shelf.",
      "Products, prices, stock, and the details that help customers choose.",
      btn("+ Add product", "product-new", true) +
        btn("Export inventory", "products-export"),
    ) +
    `<div class="toolbar"><input id="studio-search" class="search" placeholder="Search name, SKU, category, or barcode…" value="${esc(query)}"><a class="button" href="/shop.html" target="_blank">Preview store ↗</a></div><div class="table-wrap">${
      state.products.length
        ? `<table><thead><tr><th>Product</th><th>SKU / barcode</th><th>Price</th><th>Stock</th><th>Visibility</th><th></th></tr></thead><tbody>${filtered(
            state.products,
          )
            .map(
              (p) =>
                `<tr><td><div class="row-name">${p.image ? `<img class="image-thumb" src="${esc(safeURL(p.image, true))}" alt="">` : ""}<div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div></div></td><td>${esc(p.sku)}<small>${esc(p.barcode)}</small></td><td>${money(p.price)}<small>Tax ${p.tax_rate}%</small></td><td>${p.track_stock ? `${p.stock_qty} ${p.stock_qty <= p.low_stock ? badge("Low stock") : ""}` : "Not tracked"}</td><td>${badge(p.status)}</td><td>${btn("Edit", "product-edit", false, `data-id="${p.id}"`)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : empty(
            "Your shelf is ready.",
            "Add products to publish them in the store and POS.",
          )
    }</div>`
  );
}
function editProduct(id) {
  const p = state.products.find((x) => x.id === id) || {
    name: "",
    sku: "",
    price: 0,
    tax_rate: 0,
    stock_qty: 0,
    low_stock: 5,
    track_stock: true,
    status: "draft",
  };
  modal(
    id ? "Edit product" : "Add your next bestseller",
    `<div class="form-grid">${field("name", "Product name", p.name, "text", 'required maxlength="250"')}${field("sku", "Unique SKU", p.sku, "text", 'required maxlength="100"')}${field("category", "Category", p.category || "Beauty essentials")}${field("barcode", "Barcode (optional)", p.barcode || "")}${field("price", "Selling price (JMD, before tax)", p.price, "number", 'required min="0" step="0.01"')}${field("tax_rate", "Tax rate (%)", p.tax_rate, "number", 'required min="0" max="100" step="0.01"')}${field("unit_cost", "Unit cost (private)", state.costs[p.id] || 0, "number", 'min="0" step="0.01"')}${field("stock_qty", "Stock on hand", p.stock_qty, "number", 'required min="0" step="1"')}${field("low_stock", "Low stock warning at", p.low_stock, "number", 'min="0" step="1"')}${check("track_stock", "Track stock and prevent overselling", p.track_stock)}${select(
      "status",
      "Visibility",
      [
        ["draft", "Draft — private"],
        ["published", "Published — store & POS"],
        ["archived", "Archived — hidden"],
      ],
      p.status,
    )}${field("stock_reason", "Reason for any stock change", "", "text", 'placeholder="e.g. new delivery, stock count"')}${field("description", "Product description", p.description || "", "textarea")}<label class="field full image-field">Product image<input name="image" value="${esc(p.image || "")}" placeholder="Image URL"><input type="file" data-upload="image" accept="image/jpeg,image/png,image/webp,image/avif">${p.image ? `<img src="${esc(safeURL(p.image, true))}" alt="Product">` : ""}</label></div><p class="label-note">Create a separate SKU for every size or shade you stock.</p>`,
    "Save product",
    async (f) => {
      const d = Object.fromEntries(new FormData(f));
      d.track_stock = f.elements.track_stock.checked;
      if (d.image && !safeURL(d.image, true))
        throw new Error("Enter a valid image URL.");
      await command("save_product", {
        ...d,
        id: p.id || "",
        expected_updated_at: p.updated_at,
      });
      toast("Product and inventory updated.");
    },
  );
}
function deliveryPage() {
  return (
    header(
      "From your shelf to their door.",
      "Let customers choose delivery, shipping, or collection.",
      btn("+ Add delivery option", "delivery-new", true),
    ) +
    `<div class="content-grid">${state.deliveries.map((d) => `<section class="item-card"><div class="item-card-body"><span class="eyebrow">${esc(d.type)}</span><h3 style="margin-top:12px">${esc(d.name)}</h3><p>${d.fee ? money(d.fee) : "Free"} ${d.free_over ? " · Free over " + money(d.free_over) : ""}</p><p>${esc(d.estimate)}</p><p>${esc(d.areas?.join(", ") || "No area restriction")}</p><div class="item-card-footer">${badge(d.active ? "active" : "disabled")}${btn("Edit", "delivery-edit", false, `data-id="${d.id}"`)}</div></div></section>`).join("")}</div>`
  );
}
function editDelivery(id) {
  const d = state.deliveries.find((x) => x.id === id) || {
    name: "",
    type: "delivery",
    fee: 0,
    active: true,
    areas: [],
  };
  modal(
    "Delivery, made clear.",
    `<div class="form-grid">${field("name", "Delivery option name", d.name, "text", "required")}${select(
      "type",
      "Type",
      [
        ["pickup", "Collect at the salon"],
        ["delivery", "Local delivery"],
        ["shipping", "Shipping"],
      ],
      d.type,
    )}${field("fee", "Flat fee (JMD)", d.fee, "number", 'required min="0" step="0.01"')}${field("free_over", "Free above this subtotal (optional)", d.free_over ?? "", "number", 'min="0" step="0.01"')}${field("estimate", "Estimated timing", d.estimate || "")}${check("active", "Offer this option at checkout", d.active)}${field("areas", "Covered areas — one per line, or blank for all", d.areas.join("\n"), "textarea")}${field("instructions", "Customer instructions", d.instructions || "", "textarea")}</div>`,
    "Save delivery option",
    async (f) => {
      const p = Object.fromEntries(new FormData(f));
      p.active = f.elements.active.checked;
      p.areas = p.areas
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      await command("save_delivery", { ...p, id: d.id || "" });
      toast("Delivery options updated.");
    },
  );
}
function posTotals() {
  const lines = cart
    .map((c) => {
      const p = state.products.find((p) => p.id === c.id);
      if (!p) return null;
      const line = round(p.price * c.qty);
      return { ...p, qty: c.qty, line, tax: round((line * p.tax_rate) / 100) };
    })
    .filter(Boolean);
  return {
    lines,
    subtotal: round(lines.reduce((n, l) => n + l.line, 0)),
    tax: round(lines.reduce((n, l) => n + l.tax, 0)),
    total: round(lines.reduce((n, l) => n + l.line + l.tax, 0)),
  };
}
function posPage() {
  const t = posTotals(),
    open = shift(),
    list = catalogue().filter(
      (p) =>
        (category === "all" || p.category === category) &&
        [p.name, p.sku, p.barcode]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    header(
      "A beautifully simple checkout.",
      "Search or scan. Add items. Take payment.",
      open
        ? btn("Close till", "shift-close")
        : btn("Open your till", "shift-open", true),
    ) +
    `<div class="pos-status ${open ? "is-open" : ""}"><span>${open ? "● Till open · " + money(open.opening_cash) + " opening cash" : "○ Till closed · open it before taking a payment"}</span><div>${btn("Held sales (" + state.held.length + ")", "held-list")}${btn("Recent sales", "recent-sales")}</div></div><div class="pos-layout"><section class="pos-catalog"><div class="toolbar"><input id="pos-search" class="search" placeholder="Search products or scan a barcode…" value="${esc(query)}" aria-label="Search or scan product"></div><div class="pos-categories"><button data-studio="pos-category" data-category="all" class="${category === "all" ? "selected" : ""}">All products</button>${[...new Set(catalogue().map((p) => p.category))].map((c) => `<button data-studio="pos-category" data-category="${esc(c)}" class="${category === c ? "selected" : ""}">${esc(c)}</button>`).join("")}</div><div class="pos-products">${list.map((p) => `<button class="pos-product" data-studio="pos-add" data-id="${p.id}" ${p.track_stock && p.stock_qty <= 0 ? "disabled" : ""}>${p.image ? `<img src="${esc(safeURL(p.image, true))}" alt="">` : `<span class="pos-product-placeholder">b<span>+</span></span>`}<div><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · ${p.track_stock ? p.stock_qty + " in stock" : "Available"}</small><b>${money(p.price)}</b></div></button>`).join("") || empty("Your products will appear here.", "Publish products to start selling.")}</div></section><aside class="pos-basket"><div class="pos-basket-title"><h2>Current sale</h2><span>${cart.reduce((n, c) => n + c.qty, 0)} items</span></div><div class="pos-lines">${t.lines.map((l) => `<div class="pos-line"><div><strong>${esc(l.name)}</strong><small>${money(l.price)} each</small><div class="qty"><button data-studio="pos-minus" data-id="${l.id}" aria-label="Remove one">−</button><b>${l.qty}</b><button data-studio="pos-add" data-id="${l.id}" aria-label="Add one">+</button></div></div><strong>${money(l.line)}</strong></div>`).join("") || '<div class="pos-empty"><span>✦</span><h3>Let’s make a sale.</h3><p>Tap a product to add it here.</p></div>'}</div><div class="pos-summary"><p><span>Subtotal</span><b>${money(t.subtotal)}</b></p><p><span>Tax</span><b>${money(t.tax)}</b></p><p class="pos-grand"><span>Total</span><b>${money(t.total)}</b></p><button class="button primary pos-pay" data-studio="pos-checkout" ${!cart.length || !open || !navigator.onLine ? "disabled" : ""}>Take payment · ${money(t.total)}</button><div class="studio-actions">${btn("Hold sale", "cart-hold", false, cart.length ? "" : "disabled")}${btn("Clear", "cart-clear", false, cart.length ? "" : "disabled")}</div><small>Stock and totals are confirmed when the sale is saved.</small></div></aside></div>`
  );
}
function checkout() {
  const t = posTotals();
  let split = [];
  modal(
    "Complete this sale.",
    `<div class="checkout-total"><small>SALE TOTAL</small><h2 id="checkout-total">${money(t.total)}</h2></div><div class="form-grid">${field("name", "Customer name (optional)", "", "text", 'placeholder="Walk-in customer"')}${field("email", "Email for invoice (optional)", "", "email")}${field("phone", "Phone (optional)", "", "tel")}${field("discount", "Discount (JMD)", 0, "number", `min="0" max="${t.total}" step="0.01" ${context.is_admin || context.staff?.can_discount ? "" : "readonly"}`)}${select(
      "method",
      "Payment method",
      [
        ["cash", "Cash"],
        ["card", "External card terminal"],
        ["bank", "Verified bank transfer"],
        ["split", "Split payment"],
      ],
      "cash",
    )}${field("reference", "Payment reference (optional)")}${field("cash_received", "Cash received (JMD)", t.total, "number", 'min="0" step="0.01"')}<div class="full" id="split-payment" hidden><div class="form-grid">${select(
      "split_method",
      "Add payment",
      [
        ["cash", "Cash"],
        ["card", "Card terminal"],
        ["bank", "Bank transfer"],
      ],
      "cash",
    )}${field("split_amount", "Amount", "", "number", 'min="0.01" step="0.01"')}</div><button type="button" class="button" id="split-add">Add payment</button><div id="split-lines"></div></div><p id="cash-change" class="full notice">Change: ${money(0)}</p>${field("notes", "Private sale note (optional)", "", "textarea")}</div><p class="label-note">Take card payments on your external terminal and confirm success before saving. Do not enter card numbers here.</p>`,
    "Confirm sale & receipt",
    async (f) => {
      if (!navigator.onLine)
        throw new Error("Reconnect before completing the sale.");
      const p = Object.fromEntries(new FormData(f));
      const due = round(t.total - Number(p.discount || 0));
      p.items = cart;
      p.key = cartKey;
      p.payments =
        p.method === "split"
          ? split
          : [{ method: p.method, amount: due, reference: p.reference }];
      const result = await command("sale", p);
      cart = [];
      cartKey = uid();
      await refresh();
      toast("Sale saved. Change: " + money(result.change));
      setTimeout(
        () =>
          showInvoice(result.invoice_id).catch((e) => toast(e.message, true)),
        100,
      );
    },
  );
  const f = $("#studio-form");
  const update = () => {
    const due = round(t.total - Number(f.elements.discount.value || 0));
    $("#checkout-total").textContent = money(due);
    $("#split-payment").hidden = f.elements.method.value !== "split";
    $("#cash-change").textContent =
      f.elements.method.value === "cash"
        ? "Change: " +
          money(Math.max(0, Number(f.elements.cash_received.value || 0) - due))
        : f.elements.method.value === "split"
          ? "Payments added: " +
            money(split.reduce((n, l) => n + l.amount, 0)) +
            " / " +
            money(due)
          : "Confirm the payment on your terminal or bank before saving.";
  };
  f.addEventListener("input", update);
  f.addEventListener("change", update);
  $("#split-add").onclick = () => {
    const amount = round(Number(f.elements.split_amount.value));
    if (!(amount > 0)) return;
    split.push({
      method: f.elements.split_method.value,
      amount,
      reference: f.elements.reference.value,
    });
    $("#split-lines").innerHTML = split
      .map((p) => `<p>${esc(p.method)} · ${money(p.amount)}</p>`)
      .join("");
    f.elements.split_amount.value = "";
    update();
  };
}
function ordersPage() {
  const list = filtered(state.orders).filter(
    (o) => !orderFilter || o.status === orderFilter,
  );
  return (
    header(
      "Every order, cared for.",
      "From online checkout to the last item handed over.",
      btn("Open POS", "open-pos", true),
    ) +
    `<div class="toolbar"><input id="studio-search" class="search" value="${esc(query)}" placeholder="Search customer or order…"><select id="order-filter"><option value="">All statuses</option>${["pending", "confirmed", "preparing", "ready", "dispatched", "completed", "cancelled", "refunded"].map((s) => `<option ${s === orderFilter ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="table-wrap">${list.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${list.map((o) => `<tr><td>BP-${String(o.number).padStart(6, "0")}<small>${date(o.created_at)}</small></td><td>${esc(o.customer_name)}<small>${esc(o.customer_email)}</small></td><td>${badge(o.channel)}</td><td>${money(o.total)}</td><td>${badge(o.status)}</td><td>${btn("Open →", "order-open", false, `data-id="${o.id}"`)}</td></tr>`).join("")}</tbody></table>` : empty("Ready for your next order.", "Online and POS orders share this list and inventory.")}</div>`
  );
}
async function orderDetail(id) {
  const { order: o, invoice: i, items } = await command("order_detail", { id });
  modal(
    "Order BP-" + String(o.number).padStart(6, "0"),
    `<div class="detail-grid">${[
      ["Customer", o.customer_name],
      [
        "Contact",
        [o.customer_email, o.customer_phone].filter(Boolean).join(" · "),
      ],
      ["Delivery", o.delivery_snapshot?.name || "In-store"],
      ["Address", o.address || "—"],
      ["Total", money(o.total)],
      ["Payment", i.status],
    ]
      .map(([k, v]) => `<div><small>${k}</small><p>${esc(v)}</p></div>`)
      .join(
        "",
      )}</div><div class="table-wrap" style="margin-top:20px"><table><tbody>${items.map((l) => `<tr><td>${esc(l.name)}<small>${l.quantity} sold · ${l.returned_qty} returned</small></td><td>${money(l.line_total)}</td></tr>`).join("")}</tbody></table></div><div class="studio-actions" style="margin:20px 0">${btn("View invoice", "invoice-open", false, `data-id="${i.id}"`)}${context.is_admin ? btn("Return / refund", "refund-order", false, `data-id="${o.id}"`) : ""}</div>${context.is_admin ? select("status", "Order status", ["pending", "confirmed", "preparing", "ready", "dispatched", "completed", "cancelled", "refunded"], o.status) : ""}`,
    context.is_admin ? "Save status" : "",
    context.is_admin
      ? async (f) => {
          await command("order_status", {
            id: o.id,
            status: f.elements.status.value,
          });
          toast("Order updated.");
        }
      : null,
  );
}
async function showInvoice(id, request = false) {
  const doc = await command(
    "invoice_for",
    request ? { request_id: id } : { invoice_id: id },
  );
  if (!doc?.invoice) throw new Error("Invoice not found.");
  modal(
    invoiceNumber(doc.invoice),
    `<div class="studio-actions" style="margin-bottom:20px">${btn("Print invoice", "invoice-print")}${btn("Download PDF", "invoice-pdf", false, `data-token="${doc.access_token}"`)}${context.can_pos && doc.invoice.paid < doc.invoice.total ? btn("Record verified payment", "invoice-payment", true, `data-id="${doc.invoice.id}" data-balance="${doc.invoice.total - doc.invoice.paid}"`) : ""}${context.is_admin && doc.invoice.source_kind !== "store" && doc.invoice.paid > doc.invoice.refunded ? btn("Record refund", "invoice-refund", false, `data-id="${doc.invoice.id}" data-balance="${doc.invoice.paid - doc.invoice.refunded}"`) : ""}</div><div id="invoice-preview">${invoiceHTML(doc)}</div>`,
    "",
  );
}
function invoicesPage() {
  return (
    header(
      "Clear invoices. Confident payments.",
      "Deposits, tuition, and sales—all tied to their source.",
      btn("Export invoices", "invoices-export"),
    ) +
    `<div class="toolbar"><input id="studio-search" class="search" value="${esc(query)}" placeholder="Search invoice number, customer, or category…"></div><div class="table-wrap">${
      state.invoices.length
        ? `<table><thead><tr><th>Invoice</th><th>Customer</th><th>Category</th><th>Total</th><th>Paid / due</th><th>Status</th><th></th></tr></thead><tbody>${filtered(
            state.invoices,
          )
            .map(
              (i) =>
                `<tr><td>${invoiceNumber(i)}<small>${date(i.created_at)}</small></td><td>${esc(i.customer_name)}<small>${esc(i.customer_email)}</small></td><td>${esc(i.source_kind)}</td><td>${money(i.total)}</td><td>${money(i.paid)} paid<small>${money(Math.max(0, i.total - i.paid))} due</small></td><td>${badge(i.status)}</td><td>${btn("Open", "invoice-open", false, `data-id="${i.id}"`)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : empty(
            "Every request gets an invoice.",
            "New bookings, courses, and store orders appear here automatically.",
          )
    }</div>`
  );
}
function deskPage() {
  const bookings =
    base().submissions?.filter((s) => s.kind === "booking") || [];
  return (
    header(
      "A calmer appointment diary.",
      "Use your live services, prices, and availability.",
      btn("+ Book a customer", "booking-new", true),
    ) +
    `<div class="stats">${[
      ["Requests", bookings.filter((s) => s.status === "new").length],
      ["Confirmed", bookings.filter((s) => s.status === "confirmed").length],
      [
        "Today",
        bookings.filter(
          (s) =>
            s.data.date ===
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Jamaica",
            }).format(new Date()),
        ).length,
      ],
      ["Completed", bookings.filter((s) => s.status === "completed").length],
    ]
      .map(
        ([l, n]) =>
          `<div class="stat"><div class="stat-top">${l}</div><div class="stat-value">${n}</div></div>`,
      )
      .join(
        "",
      )}</div><div class="toolbar"><input id="studio-search" class="search" value="${esc(query)}" placeholder="Search customer, service, or date…"></div><div class="table-wrap">${
      bookings.length
        ? `<table><thead><tr><th>Customer</th><th>Appointment</th><th>Service</th><th>Status</th><th></th></tr></thead><tbody>${filtered(
            bookings,
          )
            .sort((a, b) =>
              (b.appointment_start || b.created_at).localeCompare(
                a.appointment_start || a.created_at,
              ),
            )
            .map(
              (s) =>
                `<tr><td>${esc(s.name)}<small>${esc(s.phone)} · ${esc(s.email)}</small></td><td>${esc(s.data.date)}<small>${esc(s.data.time)}</small></td><td>${esc(s.data.item || base().content.find((c) => c.id === s.content_id)?.title || "Service")}</td><td>${badge(s.status)}</td><td>${btn("Manage", "booking-open", false, `data-id="${s.id}"`)} ${btn("Invoice", "request-invoice", false, `data-id="${s.id}"`)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : empty(
            "Make someone’s next appointment.",
            "Customers can book on the website, or you can help them here.",
          )
    }</div>`
  );
}
function bookingCreate() {
  const services = base().content.filter(
      (c) => c.kind === "service" && c.status === "published",
    ),
    pay = (businessSettings().payments || []).filter((p) => p.enabled);
  modal(
    "Book a customer.",
    `<div class="form-grid">${field("name", "Customer name", "", "text", 'required minlength="2"')}${field("email", "Customer email for invoice", "", "email", "required")}${field("phone", "Phone / WhatsApp", "", "tel", "required")}${select(
      "service_id",
      "Service",
      services.map((s) => [
        s.id,
        s.title + (s.data.price == null ? "" : ` · ${money(s.data.price)}`),
      ]),
      services[0]?.id,
    )}${field("date", "Appointment date", "", "date", "required")}${select("time", "Available start time", [["", "Choose a date first"]], "")}${select("assigned_employee", "Assign employee (optional)", [["", "Assign later"], ...state.staff.filter((s) => s.active && s.can_book).map((s) => [s.id, s.name])], "")}${select(
      "payment_method",
      "Payment method",
      pay.map((p) => [p.id, p.label]),
      pay[0]?.id,
    )}${field("notes", "Customer notes", "", "textarea")}</div><p class="notice">An invoice is created automatically. Confirm availability and payment separately.</p>`,
    "Save booking & invoice",
    async (f) => {
      const p = Object.fromEntries(new FormData(f));
      p.key = uid();
      const result = await command("booking_create", p);
      toast("Booking and invoice created.");
      setTimeout(
        () => showInvoice(result.id, true).catch((e) => toast(e.message, true)),
        100,
      );
    },
  );
  const f = $("#studio-form");
  const slots = async () => {
    if (!f.elements.date.value) return;
    const times = await command("slots", {
      date: f.elements.date.value,
      service_id: f.elements.service_id.value,
    });
    f.elements.time.innerHTML = times.length
      ? times.map((t) => `<option>${t}</option>`).join("")
      : '<option value="">No times available</option>';
  };
  f.elements.date.onchange = () => slots().catch((e) => toast(e.message, true));
  f.elements.service_id.onchange = () =>
    slots().catch((e) => toast(e.message, true));
}
function bookingEdit(id) {
  const s = base().submissions.find((s) => s.id === id);
  modal(
    "Manage appointment.",
    `<div class="notice">${esc(s.name)} · ${esc(s.data.item)}<br>${esc(s.data.date)} · ${esc(s.data.time)}</div><div class="form-grid">${select("status", "Appointment status", ["new", "confirmed", "completed", "cancelled"], s.status)}${select("assigned_employee", "Assigned employee", [["", "Assign later"], ...state.staff.filter((s) => s.active && s.can_book).map((s) => [s.id, s.name])], s.assigned_employee || "")}${field("notes", "Private notes", s.admin_notes, "textarea")}</div>`,
    "Save appointment",
    async (f) => {
      await command("request_update", {
        id: s.id,
        status: f.elements.status.value,
        assigned_employee: f.elements.assigned_employee.value,
        notes: f.elements.notes.value,
      });
      toast("Appointment updated.");
    },
  );
}
function teamPage() {
  return (
    header(
      "A team with room to shine.",
      "Individual logins. Clear permissions. A shared, connected workspace.",
      btn("+ Add employee", "staff-new", true),
    ) +
    `<div class="content-grid">${state.staff.map((s) => `<section class="item-card"><div class="item-card-body"><span class="avatar">${esc(s.name.slice(0, 1))}</span><h3 style="margin-top:18px">${esc(s.name)}</h3><p>${esc(s.email)}</p><p>${s.can_pos ? "✓ POS access<br>" : ""}${s.can_book ? "✓ Booking access<br>" : ""}${s.can_discount ? "✓ Discounts allowed" : ""}</p><div class="item-card-footer">${badge(s.active ? "active" : "disabled")}${btn("Manage account", "staff-edit", false, `data-id="${s.id}"`)}</div></div></section>`).join("") || empty("Your team starts here.", "Create an employee account and choose the work they can do.")}</div>`
  );
}
function staffEdit(id) {
  const s = state.staff.find((x) => x.id === id) || {
    name: "",
    email: "",
    active: true,
    can_pos: true,
    can_book: true,
    can_discount: false,
  };
  modal(
    id ? "Manage employee" : "Welcome someone to your team.",
    `<div class="form-grid">${field("name", "Employee name", s.name, "text", 'required minlength="2"')}${field("email", "Sign-in email", s.email, "email", `required ${id ? "readonly" : ""}`)}${field("password", id ? "New temporary password (leave blank to keep)" : "Temporary password", "", "password", `minlength="12" autocomplete="new-password" ${id ? "" : "required"}`)}${check("active", "Account enabled", s.active)}${check("can_pos", "Can use the POS and store orders", s.can_pos)}${check("can_book", "Can book and manage appointments", s.can_book)}${check("can_discount", "May apply POS discounts", s.can_discount)}</div><div class="notice">The employee signs in at ${esc(location.origin + "/admin/index.html")} and changes their temporary password. Share credentials privately. Password resets and disabled accounts revoke existing sessions.</div>`,
    "Save employee account",
    async (f) => {
      const p = Object.fromEntries(new FormData(f));
      for (const k of ["active", "can_pos", "can_book", "can_discount"])
        p[k] = f.elements[k].checked;
      await business("staff_save", {
        ...p,
        user_id: s.user_id,
        force_password_change: p.password ? true : s.force_password_change,
      });
      toast("Employee account updated.");
    },
  );
}
function lineGraph(data) {
  if (!data?.length) return "";
  const values = data.map((x) => Number(x.amount)),
    max = Math.max(1, ...values),
    min = Math.min(0, ...values),
    span = max - min;
  const pts = values.map((v, k) => [
    55 + k * (630 / Math.max(1, values.length - 1)),
    235 - ((v - min) / span) * 190,
  ]);
  const path = pts
    .map((p, k) => (k ? "L" : "M") + p.map((x) => x.toFixed(1)).join(","))
    .join(" ");
  return `<svg class="finance-line" viewBox="0 0 720 280" role="img" aria-label="Daily net payments from ${esc(data[0].day)} to ${esc(data.at(-1).day)}"><defs><linearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4f8f79" stop-opacity=".22"/><stop offset="1" stop-color="#4f8f79" stop-opacity="0"/></linearGradient></defs>${[
    0, 1, 2, 3, 4,
  ]
    .map((n) => {
      const y = 45 + n * 47.5;
      return `<line x1="55" x2="685" y1="${y}" y2="${y}" stroke="#e7ece5" stroke-dasharray="4 5"/><text x="45" y="${y + 4}" text-anchor="end" font-size="10" fill="#8a9890">${Math.round(max - (n * span) / 4).toLocaleString()}</text>`;
    })
    .join(
      "",
    )}<path d="${path} L685,235 L55,235 Z" fill="url(#income-fill)"/><path d="${path}" fill="none" stroke="#38735e" stroke-width="3" stroke-linejoin="round"/><text x="55" y="265" font-size="10" fill="#8a9890">${esc(data[0].day)}</text><text x="685" y="265" text-anchor="end" font-size="10" fill="#8a9890">${esc(data.at(-1).day)}</text></svg>`;
}
function financePage() {
  return (
    header(
      "The story behind your numbers.",
      "Payments, refunds, appointments, courses, and sales—clearly connected.",
      btn("Export transactions", "finance-export"),
    ) +
    `<form id="finance-range" class="toolbar">${field("from", "From (Jamaica date)", financeFrom, "date", "required")}${field("to", "To", financeTo, "date", "required")}<button class="button primary" type="submit">Update report</button></form><div id="finance-report"><div class="panel"><p>Bringing your numbers together…</p></div></div>`
  );
}
async function renderFinance() {
  report = await command("finance", { from: financeFrom, to: financeTo });
  if (activeView !== "finance") return;
  const r = report,
    colors = ["#214d49", "#a8beac", "#d5b67b", "#8fa7b1"],
    categories = r.categories || [],
    positive = categories.reduce(
      (n, c) => n + Math.max(0, Number(c.amount)),
      0,
    );
  let end = 0;
  const stops = categories.map((c, k) => {
    const start = end;
    end += positive ? (Math.max(0, Number(c.amount)) / positive) * 100 : 0;
    return `${colors[k % 4]} ${start}% ${end}%`;
  });
  $("#finance-report").innerHTML = `<div class="stats">${[
    [r.net_received, "Net received", "Payments less refunds"],
    [r.gross_received, "Payments received", "Verified payments only"],
    [r.refunds, "Refunds", "Recorded in this period"],
    [r.outstanding, "Outstanding", "All open invoices"],
  ]
    .map(
      ([n, l, t]) =>
        `<div class="stat"><div class="stat-top">${l}</div><div class="stat-value finance-value">${money(n)}</div><small>${t}</small></div>`,
    )
    .join(
      "",
    )}</div><div class="finance-columns"><section class="panel"><div class="panel-header"><h3>Your income over time</h3><span class="badge">JMD · net payments</span></div>${lineGraph(r.daily)}</section><section class="panel"><div class="panel-header"><h3>Where it comes from</h3></div><div class="finance-donut" style="background:conic-gradient(${stops.length ? stops.join(",") : "#e8eee6 0% 100%"})"><div><strong>${r.invoices_issued}</strong><small>invoices issued</small></div></div><div class="chart-legend">${categories.map((c, k) => `<p><span><i style="background:${colors[k % 4]}"></i>${esc(c.source_kind)}</span><b>${money(c.amount)}</b></p>`).join("") || "<p>No payments in this period.</p>"}</div></section></div><div class="finance-columns"><section class="panel"><div class="panel-header"><h3>Payment methods</h3></div><div class="finance-bars">${(r.methods || []).map((m) => `<div><p><span>${esc(m.method)}</span><b>${money(m.amount)}</b></p><div><span style="width:${(Math.max(0, Number(m.amount)) / Math.max(1, Number(r.gross_received))) * 100}%"></span></div></div>`).join("") || "<p>No recorded payments yet.</p>"}</div></section><section class="panel"><div class="panel-header"><h3>Staff sales</h3></div>${(r.staff_sales || []).map((s) => `<div class="check-row"><div>${esc(s.name)}<small>${s.sales} POS sales</small></div><b>${money(s.total)}</b></div>`).join("") || "<p>Staff sales will appear here.</p>"}</section></div><section class="panel"><div class="panel-header"><h3>Your top products</h3><small>Paid orders · margin estimate before discounts and overheads</small></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Net units</th><th>Sales before discounts</th><th>Margin estimate</th></tr></thead><tbody>${(r.top_products || []).map((p) => `<tr><td>${esc(p.name)}</td><td>${p.units}</td><td>${money(p.sales)}</td><td>${money(p.margin_before_discounts)}</td></tr>`).join("") || '<tr><td colspan="4">No paid product sales in this period.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-header"><h3>Transaction register</h3><small>Newest first</small></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Method</th><th>Amount</th><th>Reference</th></tr></thead><tbody>${
    (r.transactions || [])
      .slice(0, 200)
      .map(
        (t) =>
          `<tr><td>${date(t.created_at)}</td><td>${esc(t.source_kind)}</td><td>${badge(t.kind)}</td><td>${esc(t.method)}</td><td>${money(t.kind === "refund" ? -t.amount : t.amount)}</td><td>${esc(t.reference)}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="6">Verified payments will appear here.</td></tr>'
  }</tbody></table></div><p class="label-note">Showing up to 200 latest transactions. The export includes the full selected period.</p></section>`;
}
function emailPage() {
  return (
    header(
      "Emails that feel like your brand.",
      "Thoughtful messages, polished invoices, and a clear delivery record.",
      btn("Connect email provider", "email-connect", true),
    ) +
    `<div class="tabs">${[
      ["templates", "Email templates"],
      ["branding", "Branding & sender"],
      ["log", "Delivery log"],
    ]
      .map(
        ([id, name]) =>
          `<button data-studio="email-tab" data-tab="${id}" class="${emailTab === id ? "active" : ""}">${name}</button>`,
      )
      .join(
        "",
      )}</div><div class="notice" id="email-status">Checking your email setup…</div>${emailTab === "templates" ? `<div class="content-grid">${state.templates.map((t) => `<section class="item-card"><div class="item-card-body"><span class="eyebrow">${t.enabled ? "ENABLED" : "DISABLED"}</span><h3 style="margin-top:15px">${esc(t.name)}</h3><p>${esc(t.subject)}</p><div class="studio-actions">${btn("Edit wording", "template-edit", false, `data-id="${t.id}"`)}${btn("Preview", "template-preview", false, `data-id="${t.id}"`)}</div></div></section>`).join("")}</div>` : emailTab === "branding" ? brandingForm() : `<div class="table-wrap"><table><thead><tr><th>Created</th><th>Recipient</th><th>Template</th><th>Status</th><th>Details</th><th></th></tr></thead><tbody>${state.outbox.map((e) => `<tr><td>${date(e.created_at)}</td><td>${esc(e.recipient)}</td><td>${esc(e.template_id)}</td><td>${badge(e.status)}</td><td><small>${esc(e.last_error || e.provider_id || "Queued for delivery")}</small></td><td>${btn("Resend", "email-retry", false, `data-id="${e.id}"`)}</td></tr>`).join("") || '<tr><td colspan="6">Invoice emails will appear here after customers submit a request.</td></tr>'}</tbody></table></div>`}`
  );
}
function brandingForm() {
  const s = settings();
  return `<form id="branding-form" class="panel"><div class="form-grid">${field("email_from_name", "Sender name", s.email_from_name || businessSettings().name)}${field("email_from", "Verified sender email", s.email_from || "", "email", "required")}${field("email_reply_to", "Reply-to email", s.email_reply_to || businessSettings().email, "email", "required")}${field("email_accent", "Email accent colour", s.email_accent || "#183d3c", "color")}${field("email_logo", "Email logo URL (HTTPS)", s.email_logo || "")}${field("invoice_logo", "Invoice logo URL (PNG/JPG, HTTPS)", s.invoice_logo || "")}${field("invoice_accent", "Invoice accent colour", s.invoice_accent || "#183d3c", "color")}${field("invoice_footer", "Invoice footer", s.invoice_footer || "", "textarea")}</div><p class="notice">Verify your sending domain in Resend. Replies go to the reply-to address. A verified sender and server-side API key are both required.</p><button class="button primary" type="submit">Save branding & sender</button></form>`;
}
function editTemplate(id) {
  const t = state.templates.find((t) => t.id === id);
  modal(
    t.name,
    `<div class="form-grid">${field("subject", "Email subject", t.subject, "text", "required")}${field("heading", "Main heading", t.heading, "text", "required")}${field("body", "Email message", t.body, "textarea", "required")}${field("footer", "Footer", t.footer, "textarea")}${check("enabled", "Send this type of email automatically", t.enabled)}</div><p class="notice">Available placeholders: {{customer_name}}, {{business_name}}, {{invoice_number}}, {{total}}, {{due}}, {{appointment_date}}, {{status}}. The invoice attachment and totals are generated automatically.</p>`,
    "Save email template",
    async (f) => {
      await checked(
        db
          .from("bp_email_templates")
          .update({
            subject: f.elements.subject.value,
            heading: f.elements.heading.value,
            body: f.elements.body.value,
            footer: f.elements.footer.value,
            enabled: f.elements.enabled.checked,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
      toast("Email template saved.");
    },
  );
}
function notificationPage() {
  return (
    header(
      "Nothing important, missed.",
      "Live updates for the work your account handles.",
      btn("Enable alerts", "enable-alerts", true) +
        btn("Install admin app", "install") +
        btn("Mark all read", "notifications-read"),
    ) +
    `<div class="panel">${state.notifications.map((n) => `<div class="notification-row ${Number(n.id) > lastNotification ? "unread" : ""}"><span class="notification-symbol">${n.kind === "sale" ? "↗" : n.kind === "course" ? "◇" : "◷"}</span><div><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${date(n.created_at)}</small></div>${btn("Open", "notification-open", false, `data-kind="${n.kind}" data-id="${n.entity_id || ""}"`)}</div>`).join("") || empty("All quiet for now.", "Bookings, sales, and course requests will appear here as they happen.")}</div><p class="label-note">Alerts require browser permission. This workspace remains online for stock, appointments, and payment operations.</p>`
  );
}
function accountPage() {
  return (
    header(
      "Your own space on the team.",
      "Keep your sign-in details private and up to date.",
    ) +
    `<section class="panel"><h2>${esc(context.staff?.name || "Studio owner")}</h2><p>${esc(operator.email)}</p><p>${context.is_admin ? "Owner access" : [context.can_pos ? "POS access" : "", context.can_book ? "Booking access" : ""].filter(Boolean).join(" · ")}</p>${btn("Change my password", "self-password", true)}</section>`
  );
}
function shopSettings() {
  const s = settings();
  return (
    header(
      "Your store. Your way.",
      "Shared settings for the website, counter, and booking desk.",
    ) +
    `<form id="shop-settings-form" class="panel"><div class="form-grid">${field("shop_title", "Store heading", s.shop_title || "")}${field("shop_intro", "Store introduction", s.shop_intro || "")}${field("booking_open", "Salon opens at (Jamaica)", s.booking_open || "09:00", "time", "required")}${field("booking_close", "Salon closes at", s.booking_close || "19:00", "time", "required")}${field("booking_interval", "Appointment start interval (minutes)", s.booking_interval || 30, "number", 'required min="15" max="240" step="15"')}${field("booking_capacity", "Maximum overlapping appointments", s.booking_capacity || 1, "number", 'required min="1" max="100" step="1"')}<div class="full"><label class="field">Open weekdays</label><div class="weekday-options">${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, k) => check("day_" + (k + 1), d, (s.booking_days || [1, 2, 3, 4, 5, 6]).includes(k + 1))).join("")}</div></div>${field("blackout_dates", "Closed dates — one YYYY-MM-DD per line", (s.blackout_dates || []).join("\n"), "textarea")}${field("store_terms", "Store checkout terms", s.store_terms || "", "textarea")}${field("receipt_message", "Receipt message", s.receipt_message || "", "textarea")}</div><button class="button primary" type="submit">Save shared settings</button></form>`
  );
}
async function saveSettings(values) {
  const row = base().content.find((r) => r.id === "shop-settings");
  const rows = await checked(
    db
      .from("bp_content")
      .update({ data: { ...row.data, ...values } })
      .eq("id", row.id)
      .eq("version", row.version)
      .select(),
  );
  if (!rows.length)
    throw new Error("These settings changed elsewhere. Refresh before saving.");
  toast("Shared settings saved.");
  await refreshBase();
}
function drawHere() {
  const el = $("#content");
  if (el) {
    el.innerHTML = render(activeView);
    mount(activeView);
  }
}
function updateBadge() {
  const el = $("#studio-notification-count");
  if (el)
    el.textContent = state.notifications.filter(
      (n) => Number(n.id) > lastNotification,
    ).length;
}
function render(v) {
  if (activeView !== v) {
    query = "";
    activeView = v;
  }
  const pages = {
    products: productPage,
    deliveries: deliveryPage,
    pos: posPage,
    orders: ordersPage,
    invoices: invoicesPage,
    desk: deskPage,
    team: teamPage,
    finance: financePage,
    emails: emailPage,
    notifications: notificationPage,
    account: accountPage,
    "shop-settings": shopSettings,
  };
  return pages[v]?.() || "";
}
function mount(v) {
  activeView = v;
  updateBadge();
  if ($("#studio-search"))
    $("#studio-search").oninput = (e) => {
      query = e.target.value;
      const pos = e.target.selectionStart;
      drawHere();
      $("#studio-search").focus();
      $("#studio-search").setSelectionRange(pos, pos);
    };
  if ($("#order-filter"))
    $("#order-filter").onchange = (e) => {
      orderFilter = e.target.value;
      drawHere();
    };
  if ($("#pos-search")) {
    $("#pos-search").oninput = (e) => {
      query = e.target.value;
      const p = e.target.selectionStart;
      drawHere();
      $("#pos-search").focus();
      $("#pos-search").setSelectionRange(p, p);
    };
    $("#pos-search").onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const p = catalogue().find(
          (p) =>
            p.barcode === e.target.value.trim() ||
            p.sku.toLowerCase() === e.target.value.trim().toLowerCase(),
        );
        if (p) {
          addProduct(p.id);
          query = "";
          drawHere();
          $("#pos-search")?.focus();
        }
      }
    };
  }
  if (v === "finance") {
    renderFinance().catch((e) => toast(e.message, true));
    $("#finance-range").onsubmit = (e) => {
      e.preventDefault();
      financeFrom = e.target.from.value;
      financeTo = e.target.to.value;
      renderFinance().catch((e) => toast(e.message, true));
    };
  }
  if (v === "emails") {
    business("email_status")
      .then((r) => {
        if ($("#email-status"))
          $("#email-status").textContent = r.configured
            ? "Email key saved. Use a verified sender; the delivery log shows provider acceptance or any errors."
            : "Email delivery needs setup. Connect your Resend API key and verified sender; queued invoices are retained until delivery is configured.";
      })
      .catch((e) => {
        if ($("#email-status")) $("#email-status").textContent = e.message;
      });
    if ($("#branding-form"))
      $("#branding-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const p = Object.fromEntries(new FormData(e.target));
          for (const k of ["email_logo", "invoice_logo"])
            if (p[k] && !/^https:\/\//i.test(p[k]))
              throw new Error("Logo URLs must use HTTPS.");
          await saveSettings(p);
        } catch (err) {
          toast(err.message, true);
        }
      };
  }
  if (v === "shop-settings")
    $("#shop-settings-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const p = Object.fromEntries(new FormData(e.target));
        p.booking_days = [1, 2, 3, 4, 5, 6, 7].filter(
          (n) => e.target.elements["day_" + n].checked,
        );
        p.booking_capacity = Number(p.booking_capacity);
        p.booking_interval = Number(p.booking_interval);
        p.blackout_dates = p.blackout_dates
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!p.booking_days.length || p.booking_close <= p.booking_open)
          throw new Error(
            "Choose at least one open day and a closing time after opening.",
          );
        if (p.blackout_dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d)))
          throw new Error("Closed dates must use YYYY-MM-DD.");
        for (const k of Object.keys(p)) if (k.startsWith("day_")) delete p[k];
        await saveSettings(p);
      } catch (err) {
        toast(err.message, true);
      }
    };
  if (v === "dashboard" && !$("#studio-dashboard-actions")) {
    $("#content .heading")?.insertAdjacentHTML(
      "afterend",
      `<div id="studio-dashboard-actions" class="studio-quick-strip"><div><span class="eyebrow">YOUR CONNECTED COUNTER</span><p>${state.orders.length} store orders · ${state.products.filter((p) => p.track_stock && p.stock_qty <= p.low_stock).length} low-stock products</p></div><div class="studio-actions">${btn("Open POS", "open-pos", true)}${btn("Book a customer", "booking-new")}${btn("Financial overview", "open-finance")}</div></div>`,
    );
  }
}
function addProduct(id) {
  const p = catalogue().find((x) => x.id === id);
  if (!p) return;
  const old = cart.find((x) => x.id === id);
  if (p.track_stock && (old?.qty || 0) >= p.stock_qty) {
    toast("No more stock is available for " + p.name, true);
    return;
  }
  if (old) old.qty++;
  else cart.push({ id, qty: 1 });
}
async function changePassword(force = false) {
  modal(
    force ? "Choose your own password." : "Change my password.",
    `<p>Your password must have at least 12 characters.</p><div class="form-grid">${field("password", "New password", "", "password", 'required minlength="12" autocomplete="new-password"')}${field("confirm", "Confirm password", "", "password", 'required minlength="12" autocomplete="new-password"')}</div>`,
    "Save password",
    async (f) => {
      if (f.elements.password.value !== f.elements.confirm.value)
        throw new Error("Passwords must match.");
      await business("self_password", { password: f.elements.password.value });
      await db.auth.refreshSession();
      toast("Password saved.");
      if (force) location.reload();
    },
  );
  if (force) {
    $("#editor").oncancel = (e) => e.preventDefault();
    $("#editor")
      .querySelectorAll("[data-close]")
      .forEach((b) => (b.hidden = true));
  }
}
async function downloadPDF(token) {
  const doc = await command("document", { token });
  if (!doc) throw new Error("Invoice not found.");
  download(
    invoiceNumber(doc.invoice) + ".pdf",
    await invoicePDF(doc),
    "application/pdf",
  );
}

function refundOrderDialog(id) {
  const key = uid();
  command("order_detail", { id })
    .then(({ order: o, items }) => {
      modal(
        "Return products & record refund.",
        `<p>Choose the quantities coming back. The system calculates the refund using the original prices, tax, and discount.</p>${items
          .filter((l) => l.quantity > l.returned_qty)
          .map((l) =>
            field(
              "item_" + l.id,
              l.name + " — " + (l.quantity - l.returned_qty) + " returnable",
              0,
              "number",
              `min="0" max="${l.quantity - l.returned_qty}" step="1"`,
            ),
          )
          .join(
            "",
          )}<div class="form-grid">${check("restock", "Return goods to available stock", true)}${check("refund_delivery", "Refund delivery fee when all goods are returned", false)}${select(
          "method",
          "Refund payment method",
          [
            ["cash", "Cash"],
            ["card", "Card terminal"],
            ["bank", "Bank transfer"],
            ["other", "Other"],
          ],
          "cash",
        )}${field("reference", "Provider refund reference")}${field("reason", "Reason for refund", "", "textarea", 'required minlength="3"')}</div>`,
        "Confirm return & refund",
        async (f) => {
          const entries = items
            .map((l) => ({
              id: l.id,
              qty: Number(f.elements["item_" + l.id]?.value || 0),
            }))
            .filter((l) => l.qty > 0);
          if (!entries.length)
            throw new Error("Choose at least one item to return.");
          const p = Object.fromEntries(new FormData(f));
          await command("refund_order", {
            ...p,
            id,
            key,
            items: entries,
            restock: f.elements.restock.checked,
            refund_delivery: f.elements.refund_delivery.checked,
          });
          toast("Refund and stock return recorded.");
        },
      );
    })
    .catch((e) => toast(e.message, true));
}
async function enableAlerts() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error(
      "Push is unavailable here. Install the admin app and try a supported browser.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Enable notification permission in your browser settings.");
  const { publicKey } = await business("push_config");
  if (!publicKey) throw new Error("Push configuration is not ready.");
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(
    atob(
      publicKey.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (publicKey.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  await checked(
    db.from("bp_push_subscriptions").upsert(
      {
        user_id: operator.id,
        endpoint: sub.endpoint,
        subscription: sub.toJSON(),
      },
      { onConflict: "endpoint" },
    ),
  );
  toast("Alerts enabled for this device.");
}
function navigate(v) {
  location.hash = v;
}
async function handle(a, b) {
  const id = b.dataset.id;
  if (a === "help") return help();
  if (a === "open-pos") return navigate("pos");
  if (a === "open-finance") return navigate("finance");
  if (a === "product-new") return editProduct();
  if (a === "product-edit") return editProduct(id);
  if (a === "delivery-new") return editDelivery();
  if (a === "delivery-edit") return editDelivery(id);
  if (a === "booking-new") return bookingCreate();
  if (a === "booking-open") return bookingEdit(id);
  if (a === "request-invoice") return showInvoice(id, true);
  if (a === "invoice-open") return showInvoice(id);
  if (a === "order-open") return orderDetail(id);
  if (a === "staff-new") return staffEdit();
  if (a === "staff-edit") return staffEdit(id);
  if (a === "self-password") return changePassword();
  if (a === "refund-order") return refundOrderDialog(id);
  if (a === "pos-category") {
    category = b.dataset.category;
    drawHere();
    return;
  }
  if (a === "pos-add") {
    addProduct(id);
    drawHere();
    return;
  }
  if (a === "pos-minus") {
    cart = cart
      .map((c) => (c.id === id ? { ...c, qty: c.qty - 1 } : c))
      .filter((c) => c.qty > 0);
    drawHere();
    return;
  }
  if (a === "cart-clear") {
    if (confirm("Clear this sale?")) {
      cart = [];
      cartKey = uid();
      drawHere();
    }
    return;
  }
  if (a === "pos-checkout") return checkout();
  if (a === "shift-open")
    return modal(
      "Open your till.",
      `<p>Enter the cash already in the drawer before you start selling.</p>${field("opening_cash", "Starting cash (JMD)", 0, "number", 'required min="0" step="0.01"')}${field("notes", "Opening note (optional)")}`,
      "Open till",
      async (f) => {
        await command("shift_open", Object.fromEntries(new FormData(f)));
        toast("Your till is open.");
      },
    );
  if (a === "shift-close") {
    const s = shift();
    return modal(
      "Close & count your till.",
      `<p>Count the cash in the drawer. The system compares it with the opening cash and recorded cash payments/refunds.</p>${field("counted_cash", "Cash counted (JMD)", "", "number", 'required min="0" step="0.01"')}${field("notes", "Closing note", "", "textarea")}`,
      "Close till",
      async (f) => {
        const r = await command("shift_close", {
          ...Object.fromEntries(new FormData(f)),
          id: s.id,
        });
        toast(
          "Till closed. Difference: " + money(r.counted_cash - r.expected_cash),
        );
      },
    );
  }
  if (a === "cart-hold")
    return modal(
      "Hold this sale.",
      field(
        "label",
        "Name for this held sale",
        "",
        "text",
        'required maxlength="100"',
      ),
      "Hold sale",
      async (f) => {
        await command("hold_cart", { label: f.elements.label.value, cart });
        cart = [];
        cartKey = uid();
        toast("Sale held. Stock is not reserved.");
      },
    );
  if (a === "held-list")
    return modal(
      "Held sales",
      state.held
        .map(
          (c) =>
            `<div class="check-row"><div>${esc(c.label)}<small>${date(c.created_at)}</small></div>${btn("Resume", "cart-resume", false, `data-id="${c.id}"`)}</div>`,
        )
        .join("") ||
        empty(
          "No held sales.",
          "You can pause a cart while helping another customer.",
        ),
      "",
    );
  if (a === "cart-resume") {
    if (
      cart.length &&
      !confirm("Replace the current sale with this held sale?")
    )
      return;
    const result = await command("resume_cart", { id });
    if (!result) throw new Error("This held sale has already been resumed.");
    cart = result;
    cartKey = uid();
    $("#editor").close();
    await refreshBase();
    navigate("pos");
    return;
  }
  if (a === "recent-sales") return navigate("orders");
  if (a === "invoice-print") {
    const html = $("#invoice-preview")?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) throw new Error("Allow pop-ups to print this invoice.");
    w.document.write(
      "<!doctype html><html><head><title>Beauty Plus invoice</title><style>@page{size:A4;margin:12mm}body{margin:0}.invoice-sheet{padding:0!important}table{page-break-inside:auto}tr{page-break-inside:avoid}</style></head><body>" +
        html +
        "</body></html>",
    );
    w.document.close();
    setTimeout(() => w.print(), 300);
    return;
  }
  if (a === "invoice-pdf") return downloadPDF(b.dataset.token);
  if (a === "invoice-payment" || a === "invoice-refund") {
    const refund = a === "invoice-refund",
      key = uid();
    return modal(
      refund ? "Record a verified refund." : "Record a verified payment.",
      `<p>${refund ? "Refundable" : "Outstanding"}: ${money(b.dataset.balance)}</p><div class="form-grid">${field("amount", "Amount (JMD)", b.dataset.balance, "number", `required min="0.01" max="${b.dataset.balance}" step="0.01"`)}${select(
        "method",
        "Method",
        [
          ["cash", "Cash"],
          ["card", "External card terminal"],
          ["bank", "Bank transfer"],
          ["wipay", "WiPay"],
          ["fygaro", "Fygaro"],
          ["ncb", "NCB"],
          ["other", "Other"],
        ],
        "bank",
      )}${field("reference", "Provider / bank reference")}${refund ? field("reason", "Refund reason", "", "textarea", 'required minlength="3"') : ""}</div><div class="notice">Only confirm after checking the transaction in your bank or payment provider.</div>`,
      refund ? "Record refund" : "Record payment",
      async (f) => {
        await command(refund ? "refund_invoice" : "payment", {
          ...Object.fromEntries(new FormData(f)),
          invoice_id: id,
          key,
        });
        toast(refund ? "Refund recorded." : "Payment recorded.");
      },
    );
  }
  if (a === "email-tab") {
    emailTab = b.dataset.tab;
    drawHere();
    return;
  }
  if (a === "template-edit") return editTemplate(id);
  if (a === "template-preview") {
    const r = await business("email_preview", { template: id });
    const h = $("#help");
    h.innerHTML = `<div class="dialog-header"><div><small>SUBJECT</small><h3>${esc(r.subject)}</h3></div><button class="dialog-close" data-close>×</button></div><iframe id="email-preview" sandbox="" title="Email preview" style="width:100%;height:70vh;border:0"></iframe>`;
    h.querySelector("iframe").srcdoc = r.html;
    h.showModal();
    return;
  }
  if (a === "email-connect")
    return modal(
      "Connect your email sender.",
      `<p>Create a sending key in Resend and verify your sending domain. Paste the key below; it is saved only on the server. Use Branding & sender to choose the from address and reply-to.</p>${field("api_key", "Resend API key", "", "password", 'required autocomplete="off" placeholder="re_…"')}<p><a href="https://resend.com/domains" target="_blank" rel="noopener">Open Resend domain setup ↗</a></p>`,
      "Save secure email key",
      async (f) => {
        await business("email_config", {
          api_key: f.elements.api_key.value.trim(),
        });
        toast("Email key saved. Queued deliveries will retry.");
      },
    );
  if (a === "email-retry") {
    if (!confirm("Queue another copy of this invoice email?")) return;
    await command("retry_email", { id });
    toast("Another email copy has been queued.");
    await refreshBase();
    return;
  }
  if (a === "notifications-read") {
    const last = Math.max(0, ...state.notifications.map((n) => Number(n.id)));
    await checked(
      db
        .from("bp_notification_reads")
        .upsert({ user_id: operator.id, last_id: last }),
    );
    lastNotification = last;
    drawHere();
    return;
  }
  if (a === "notification-open") {
    if (b.dataset.kind === "sale") return orderDetail(id);
    if (b.dataset.kind === "booking") {
      navigate("desk");
      return;
    }
    if (context.is_admin) navigate("students");
    return;
  }
  if (a === "enable-alerts") return enableAlerts();
  if (a === "install") {
    if (installPrompt) {
      await installPrompt.prompt();
      installPrompt = null;
    } else toast("Use your browser menu → Install app / Add to Home Screen.");
    return;
  }
  if (a === "products-export") {
    download(
      "beauty-plus-inventory.csv",
      csv([
        [
          "Name",
          "SKU",
          "Barcode",
          "Category",
          "JMD price",
          "Tax rate",
          "Stock",
          "Unit cost",
          "Status",
        ],
        ...state.products.map((p) => [
          p.name,
          p.sku,
          p.barcode,
          p.category,
          p.price,
          p.tax_rate,
          p.stock_qty,
          state.costs[p.id] || 0,
          p.status,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
    return;
  }
  if (a === "invoices-export") {
    download(
      "beauty-plus-invoices.csv",
      csv([
        [
          "Invoice",
          "Customer",
          "Email",
          "Category",
          "Total",
          "Paid",
          "Refunded",
          "Balance",
          "Status",
          "Issued",
        ],
        ...state.invoices.map((i) => [
          invoiceNumber(i),
          i.customer_name,
          i.customer_email,
          i.source_kind,
          i.total,
          i.paid,
          i.refunded,
          Math.max(0, i.total - i.paid),
          i.status,
          date(i.created_at),
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
    return;
  }
  if (a === "finance-export") {
    if (!report) throw new Error("Load a reporting period first.");
    download(
      "beauty-plus-payments-" + financeFrom + "-" + financeTo + ".csv",
      csv([
        [
          "Date",
          "Category",
          "Type",
          "JMD amount",
          "Method",
          "Reference",
          "Reason",
          "Invoice ID",
          "Recorded by",
        ],
        ...report.transactions.map((t) => [
          date(t.created_at),
          t.source_kind,
          t.kind,
          t.kind === "refund" ? -t.amount : t.amount,
          t.method,
          t.reference,
          t.reason,
          t.invoice_id,
          t.actor,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-studio]");
  if (!b) return;
  e.preventDefault();
  try {
    b.disabled = true;
    await handle(b.dataset.studio, b);
  } catch (err) {
    toast(err.message, true);
  } finally {
    b.disabled = false;
  }
});
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
function connectionNotice() {
  document.querySelector("#connection-notice")?.remove();
  if (!navigator.onLine && operator) {
    const banner = document.createElement("div");
    banner.id = "connection-notice";
    banner.className = "offline-banner";
    banner.setAttribute("role", "status");
    banner.textContent =
      "You are offline. Reconnect before saving bookings or taking payments.";
    document.body.prepend(banner);
  }
}
window.addEventListener("offline", connectionNotice);
window.addEventListener("online", () => {
  connectionNotice();
  if (operator) refreshBase().catch(() => {});
});
async function logout() {
  clearTimeout(syncTimer);
  if (channel) await db.removeChannel(channel);
  channel = null;
  try {
    const registration =
      await navigator.serviceWorker?.getRegistration("/admin/");
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      await db
        .from("bp_push_subscriptions")
        .delete()
        .eq("user_id", operator.id)
        .eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch {}
  operator = null;
  cart = [];
  cartKey = uid();
  report = null;
  for (const key of Object.keys(state)) state[key] = key === "costs" ? {} : [];
  connectionNotice();
}
function live() {
  connectionNotice();
  if (channel) db.removeChannel(channel);
  const sync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (!$("#editor")?.open)
        try {
          await refreshBase();
        } catch {}
    }, 500);
  };
  channel = db
    .channel("bp-studio-" + operator.id)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bp_notifications" },
      (payload) => {
        toast(payload.new.title);
        sync();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bp_products" },
      sync,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bp_submissions" },
      sync,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bp_orders" },
      sync,
    )
    .subscribe();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/admin/sw.js", { scope: "/admin/" })
      .catch(() => {});
}
export const studio = {
  views,
  titles,
  get ready() {
    return !!operator;
  },
  init(c, u, getBase, onRefresh) {
    context = c;
    operator = u;
    base = getBase;
    refreshBase = onRefresh;
  },
  refresh,
  render,
  mount,
  live,
  logout,
  changePassword,
  showInvoice,
  allowed(view) {
    return (
      context.is_admin ||
      (view === "pos" && context.can_pos) ||
      (view === "orders" && context.can_pos) ||
      (view === "desk" && context.can_book) ||
      ["account", "notifications"].includes(view)
    );
  },
  header() {
    return `${btn('Alerts <span id="studio-notification-count" class="notification-count">0</span>', "open-notifications")}`;
  },
  get context() {
    return context;
  },
};
// Header navigation works without exposing owner navigation to staff.
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-studio="open-notifications"]'))
    navigate("notifications");
});
