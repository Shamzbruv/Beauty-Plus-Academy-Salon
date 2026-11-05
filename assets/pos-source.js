import { db, checked, esc, download } from "./core.js";
import { invoicePDF } from "./invoice-pdf.js";
import { invoiceNumber } from "./documents.js";
import { saleTotals, tenderPlan, round } from "./pos-model.js";
import { renderTerminal, button, input, cash, icon } from "./pos-view.js";
const $ = (s) => document.querySelector(s),
  uid = () => crypto.randomUUID();
const command = (action, p = {}) =>
  checked(db.rpc("bp_command", { p_action: action, p }));
const freshPayment = () => ({
  method: "cash",
  received: "",
  cash: "",
  card: "",
  bank: "",
  reference: "",
  confirmed: false,
});
const state = {
  user: null,
  context: {},
  products: [],
  orders: [],
  held: [],
  shifts: [],
  content: [],
  cart: [],
  key: uid(),
  discount: 0,
  discountText: "0",
  discountError: "",
  customer: { name: "", email: "", phone: "" },
  payment: freshPayment(),
  view: "sell",
  step: "sell",
  search: "",
  category: "",
  stockOnly: false,
  mobileCart: false,
  error: "",
  busy: false,
  result: null,
  document: null,
  receiptMode: "new",
  shiftResult: null,
};
let channel,
  refreshTimer,
  reloading = false,
  activeAmount = "pos-received",
  toastTimer;
const totals = () => saleTotals(state.products, state.cart, state.discount);
const currentShift = () => state.shifts.find((s) => !s.closed_at);
function toast(message, error = false) {
  const el = $("#pos-toast");
  el.textContent = message;
  el.className = error ? "is-error" : "";
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}
function remember() {
  if (state.user)
    sessionStorage.setItem(
      "bp-register-draft-" + state.user.id,
      JSON.stringify({ items: state.cart, key: state.key }),
    );
}
function resetDiscount() {
  state.discount = 0;
  state.discountText = "0";
  state.discountError = "";
}
function clearDraft() {
  state.cart = [];
  state.key = uid();
  resetDiscount();
  state.discountText = "0";
  state.discountError = "";
  state.customer = { name: "", email: "", phone: "" };
  state.payment = freshPayment();
  state.error = "";
  remember();
}
function draw() {
  const active = document.activeElement,
    focus = active?.id,
    selection =
      typeof active?.selectionStart === "number" ? active.selectionStart : null;
  const productScroll = $("#pos-product-grid")?.scrollTop || 0,
    basketScroll = $(".pos-basket-lines")?.scrollTop || 0;
  $("#pos-app").innerHTML = renderTerminal(state);
  const element = focus && document.getElementById(focus);
  if (element) {
    element.focus({ preventScroll: true });
    if (selection !== null)
      try {
        element.setSelectionRange(selection, selection);
      } catch {}
  }
  if ($("#pos-product-grid")) $("#pos-product-grid").scrollTop = productScroll;
  if ($(".pos-basket-lines")) $(".pos-basket-lines").scrollTop = basketScroll;
  if ($("#pos-discount"))
    $("#pos-discount").setCustomValidity(state.discountError);
  $("#pos-payment-form")?.addEventListener("submit", completeSale);
}
function requireOnline() {
  if (!navigator.onLine)
    throw new Error("Reconnect before saving a sale or changing the till.");
}
async function load() {
  if (reloading) return;
  reloading = true;
  try {
    const context = await checked(db.rpc("bp_access_context"));
    if (context.staff?.force_password_change) {
      location.replace("/admin/#pos");
      return;
    }
    if (!context.can_pos) {
      Object.assign(state, {
        products: [],
        orders: [],
        held: [],
        shifts: [],
        context,
      });
      accessError("This account does not have active POS permission.");
      throw new Error("This account does not have active POS permission.");
    }
    state.context = context;
    const before = JSON.stringify(
      state.products.filter((p) => state.cart.some((i) => i.id === p.id)),
    );
    const products = [];
    for (let from = 0; ; from += 1000) {
      const part = await checked(
        db
          .from("bp_products")
          .select("*")
          .eq("status", "published")
          .order("sort_order")
          .order("name")
          .range(from, from + 999),
      );
      products.push(...part);
      if (part.length < 1000) break;
    }
    const [orders, held, shifts, content] = await Promise.all([
      checked(
        db
          .from("bp_orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      checked(
        db
          .from("bp_held_carts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      checked(
        db
          .from("bp_shifts")
          .select("*")
          .eq("operator_id", state.user.id)
          .order("opened_at", { ascending: false })
          .limit(30),
      ),
      checked(
        db
          .from("bp_content")
          .select("*")
          .in("id", ["site-settings", "shop-settings"])
          .eq("status", "published"),
      ),
    ]);
    Object.assign(state, { products, orders, held, shifts, content });
    if (
      state.step === "payment" &&
      before !==
        JSON.stringify(
          products.filter((p) => state.cart.some((i) => i.id === p.id)),
        )
    ) {
      state.payment.confirmed = false;
      state.error =
        "Product details changed. Review the current total and confirm your payment again.";
    }
    const available = products.reduce(
      (sum, p) =>
        sum +
        (state.cart.find((c) => c.id === p.id)?.qty || 0) *
          Number(p.price) *
          (1 + Number(p.tax_rate) / 100),
      0,
    );
    if (state.discount > round(available)) {
      resetDiscount();
      toast("The sale changed. Review the discount before payment.", true);
    }
  } finally {
    reloading = false;
  }
}
async function refresh() {
  await load();
  draw();
}
function accessError(message) {
  $("#pos-app").innerHTML =
    `<main class="pos-access"><span class="pos-brand-mark">b+</span><h1>Open your register</h1><p>${esc(message)}</p><a class="pos-primary" href="/admin/#pos">Sign in through the studio →</a><a class="pos-inline-link" href="/admin/">Back to the studio</a></main>`;
}
function dialog(title, body, submit, action) {
  const el = $("#pos-dialog");
  el.innerHTML = `<form id="pos-dialog-form"><header><div><span class="pos-eyebrow">BEAUTY PLUS REGISTER</span><h2>${title}</h2></div>${button(icon("close"), "dialog-close", "pos-icon-button", 'aria-label="Close dialog"')}</header><div class="pos-dialog-body">${body}<p class="pos-dialog-error" role="alert" hidden></p></div><footer>${button("Cancel", "dialog-close", "pos-secondary")}${submit ? `<button type="submit" class="pos-primary">${submit}</button>` : ""}</footer></form>`;
  if (action)
    $("#pos-dialog-form").onsubmit = async (event) => {
      event.preventDefault();
      const b = event.target.querySelector("[type=submit]");
      b.disabled = true;
      try {
        await action(event.target);
        el.close();
        draw();
      } catch (error) {
        const p = el.querySelector(".pos-dialog-error");
        p.textContent = error.message;
        p.hidden = false;
      } finally {
        b.disabled = false;
      }
    };
  el.showModal();
  el.querySelector("input")?.focus();
}
function openTill() {
  requireOnline();
  dialog(
    "Open your till",
    `<p>Count the cash already in your drawer. This is your opening balance.</p>${input("opening_cash", "Starting cash (JMD)", "0", 'type="number" required min="0" step="0.01"')}${input("notes", "Opening note (optional)", "", 'maxlength="500"')}`,
    "Open till",
    async (form) => {
      await command("shift_open", Object.fromEntries(new FormData(form)));
      await load();
      toast("Till opened. You are ready to sell.");
    },
  );
}
function closeTill() {
  requireOnline();
  if (state.cart.length)
    throw new Error(
      "Finish or hold the current sale before closing your till.",
    );
  const shift = currentShift();
  if (!shift) throw new Error("Your till is already closed.");
  dialog(
    "Count & close your till",
    `<p>Count the cash in the drawer. The register will compare it with your recorded cash payments and refunds.</p>${input("counted_cash", "Cash counted (JMD)", "", 'type="number" required min="0" step="0.01"')}${input("notes", "Closing note (optional)", "", 'maxlength="1000"')}`,
    "Close till",
    async (form) => {
      state.shiftResult = await command("shift_close", {
        ...Object.fromEntries(new FormData(form)),
        id: shift.id,
      });
      await load();
      state.view = "till";
      state.step = "sell";
      toast("Till closed. Reconciliation is shown below.");
    },
  );
}
function setQuantity(id, quantity) {
  if (state.step !== "sell") return;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999)
    throw new Error("Use a quantity between 1 and 999.");
  const p = state.products.find((p) => p.id === id);
  if (
    quantity > 0 &&
    !state.cart.some((i) => i.id === id) &&
    state.cart.length >= 100
  )
    throw new Error("Use no more than 100 different products in one sale.");
  if (!p && quantity > 0)
    throw new Error("This product is unavailable. Remove it from the sale.");
  if (p?.track_stock && quantity > p.stock_qty)
    throw new Error("Not enough stock for " + p.name + ".");
  state.cart = state.cart.filter((i) => i.id !== id);
  if (quantity) state.cart.push({ id, qty: quantity });
  if (!state.cart.length) resetDiscount();
  remember();
  draw();
}
function add(id) {
  const item = state.cart.find((i) => i.id === id);
  setQuantity(id, (item?.qty || 0) + 1);
}
function pay() {
  if (!state.cart.length) throw new Error("Add at least one product.");
  if (!currentShift()) return openTill();
  requireOnline();
  if (totals().lines.some((l) => l.unavailable))
    throw new Error("Remove unavailable products before payment.");
  state.view = "sell";
  state.step = "payment";
  state.mobileCart = false;
  state.error = "";
  state.payment = freshPayment();
  activeAmount = "pos-received";
  draw();
  $("#pos-received")?.focus();
}
async function completeSale(event) {
  event.preventDefault();
  if (state.busy) return;
  try {
    requireOnline();
    if (!currentShift())
      throw new Error("Open your till before completing a sale.");
    if (state.discountError) throw new Error(state.discountError);
    const t = totals();
    if (!t.lines.length || t.lines.some((l) => l.unavailable))
      throw new Error("Check the products in your sale.");
    if (
      state.discount > 0 &&
      !state.context.is_admin &&
      !state.context.staff?.can_discount
    )
      throw new Error("Your owner must allow discounts.");
    const tender = tenderPlan(state.payment, t.total);
    state.busy = true;
    state.error = "";
    draw();
    const result = await command("sale", {
      key: state.key,
      items: state.cart,
      discount: state.discount,
      ...state.customer,
      ...tender,
    });
    state.result = result;
    state.document = null;
    state.receiptMode = "new";
    clearDraft();
    state.step = "complete";
    state.view = "sell";
    state.busy = false;
    draw();
    try {
      state.document = await command("invoice_for", {
        invoice_id: result.invoice_id,
      });
    } catch (error) {
      state.error =
        "Sale saved. " + error.message + " Use Load receipt to try again.";
    }
    try {
      await load();
    } catch {
      toast(
        "Sale saved. Use Refresh stock when your connection is ready.",
        true,
      );
    }
    draw();
  } catch (error) {
    state.busy = false;
    state.error = error.message;
    draw();
  }
}
function hold() {
  requireOnline();
  if (!state.cart.length)
    throw new Error("Add products before holding a sale.");
  dialog(
    "Hold this sale",
    input(
      "label",
      "Name for this basket",
      state.customer.name || "Held sale",
      'required maxlength="100"',
    ),
    "Hold sale",
    async (form) => {
      await command("hold_cart", {
        label: form.elements.label.value,
        cart: state.cart,
      });
      clearDraft();
      state.step = "sell";
      await load();
      toast("Sale held. Stock has not been reserved.");
    },
  );
}
async function resume(id) {
  requireOnline();
  if (state.cart.length)
    throw new Error(
      "Hold or clear your current basket before resuming another sale.",
    );
  const result = await command("resume_cart", { id });
  if (!result)
    throw new Error("This sale has already been resumed by another register.");
  state.cart = Array.isArray(result) ? result : result.items || [];
  state.key = uid();
  resetDiscount();
  state.view = "sell";
  state.step = "sell";
  state.payment = freshPayment();
  remember();
  await refresh();
  $("#pos-search")?.focus();
}
async function showReceipt(id) {
  const result = await command("order_detail", { id });
  if (!result?.invoice?.id) throw new Error("The invoice could not be found.");
  state.document = await command("invoice_for", {
    invoice_id: result.invoice.id,
  });
  state.result = { invoice_id: result.invoice.id, total: result.order.total };
  state.receiptMode = "history";
  state.step = "complete";
  state.error = "";
  draw();
}
function help() {
  const views = {
    sell: [
      "Open a till with its starting cash before you take payment.",
      "Search a name or SKU, scan a barcode and press Enter, or tap a product. Adjust quantities in the sale summary.",
      "Charge opens a separate payment screen. Use cash, a verified card terminal payment, bank transfer, or a split payment.",
      "Use the amount keypad, Exact amount, and change display for cash. Every completed sale has an invoice and printable receipt.",
      "F2 focuses search. F4 opens payment. Escape returns from payment to your basket.",
    ],
    held: [
      "Hold sale saves a basket so you can help another customer.",
      "Held baskets do not reserve stock. Current prices and available stock are checked when you pay.",
      "Finish, hold, or clear your current basket before resuming another.",
    ],
    sales: [
      "Open recent store or counter receipts here.",
      "Owners can manage fulfilment, returns and refunds from the linked Store orders page. A recorded refund must also be completed with the bank/payment provider.",
    ],
    till: [
      "Enter the actual cash already in the drawer when you open.",
      "Finish or hold your current basket, count the drawer, then close your till.",
      "Expected cash comes from recorded payments and refunds. Review any difference after closing.",
    ],
  };
  dialog(
    "Using your " + (state.view === "sell" ? "register" : state.view),
    `<ol class="pos-help-list">${(views[state.view] || views.sell).map((x) => `<li>${x}</li>`).join("")}</ol>`,
    "",
    null,
  );
}
async function action(name, b) {
  if (state.busy && name !== "help") return;
  const id = b.dataset.id;
  if (name === "dialog-close") return $("#pos-dialog").close();
  if (name === "help") return help();
  if (name === "view") {
    if (state.step === "payment")
      throw new Error("Return to your sale before changing register sections.");
    state.view = b.dataset.view;
    state.step = "sell";
    state.error = "";
    draw();
    return;
  }
  if (name === "add") return add(id);
  if (name === "mobile-cart") {
    state.mobileCart = true;
    draw();
    return;
  }
  if (name === "mobile-catalog") {
    state.mobileCart = false;
    draw();
    return;
  }
  if (name === "minus") {
    const item = state.cart.find((i) => i.id === id);
    return setQuantity(id, (item?.qty || 0) - 1);
  }
  if (name === "remove") return setQuantity(id, 0);
  if (name === "clear") {
    if (!state.cart.length) return;
    dialog(
      "Clear this basket?",
      "<p>This removes the products from the current basket. Completed sales are kept in Sales.</p>",
      "Clear basket",
      async () => {
        clearDraft();
        state.step = "sell";
      },
    );
    return;
  }
  if (name === "category") {
    state.category = b.dataset.category;
    draw();
    return;
  }
  if (name === "stock-filter") {
    state.stockOnly = !state.stockOnly;
    draw();
    return;
  }
  if (name === "search-focus") return $("#pos-search")?.focus();
  if (name === "pay") return pay();
  if (name === "open-till") return openTill();
  if (name === "close-till") return closeTill();
  if (name === "hold") return hold();
  if (name === "resume") return resume(id);
  if (name === "refresh") {
    await refresh();
    toast("Stock and sales refreshed.");
    return;
  }
  if (name === "customer") {
    dialog(
      "Customer details",
      `<p>Optional. Add an email if the customer would like their invoice sent using your salon’s email setup.</p>${input("name", "Customer name", state.customer.name, 'maxlength="200"')}${input("email", "Email for invoice", state.customer.email, 'type="email" maxlength="250"')}${input("phone", "Phone", state.customer.phone, 'type="tel" maxlength="60"')}`,
      "Save customer",
      async (form) => {
        state.customer = Object.fromEntries(new FormData(form));
      },
    );
    return;
  }
  if (name === "edit-sale") {
    state.step = "sell";
    state.error = "";
    draw();
    return;
  }
  if (name === "method") {
    state.payment = { ...freshPayment(), method: b.dataset.method };
    state.error = "";
    draw();
    return;
  }
  if (name === "cash-preset") {
    state.payment.received = String(b.dataset.value);
    draw();
    return;
  }
  if (name === "key" || name === "clear-amount") {
    const mapping = {
      "pos-received": "received",
      "pos-cash": "cash",
      "pos-card": "card",
      "pos-bank": "bank",
    };
    const key = mapping[activeAmount] || "received";
    let value = String(state.payment[key] || "");
    if (name === "clear-amount") value = "";
    else if (b.dataset.key === "⌫") value = value.slice(0, -1);
    else {
      value += b.dataset.key;
      if (!/^\d*(\.\d{0,2})?$/.test(value)) return;
    }
    state.payment[key] = value;
    draw();
    return;
  }
  if (name === "receipt") return showReceipt(id);
  if (name === "new-sale") {
    if (state.cart.length) {
      state.step = "sell";
      state.view = "sell";
    } else {
      clearDraft();
      state.step = "sell";
      state.view = "sell";
    }
    state.document = null;
    draw();
    $("#pos-search")?.focus();
    return;
  }
  if (name === "print") {
    window.print();
    return;
  }
  if (name === "pdf") {
    download(
      invoiceNumber(state.document.invoice) + ".pdf",
      await invoicePDF(state.document),
      "application/pdf",
    );
    return;
  }
  if (name === "load-receipt") {
    state.document = await command("invoice_for", {
      invoice_id: state.result.invoice_id,
    });
    state.error = "";
    draw();
    return;
  }
  if (name === "fullscreen") {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-pos]");
  if (!b) return;
  event.preventDefault();
  try {
    await action(b.dataset.pos, b);
  } catch (error) {
    toast(error.message, true);
  }
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "pos-search") {
    state.search = el.value;
    draw();
    return;
  }
  if (el.id === "pos-discount") {
    state.discountText = el.value;
    const value = Number(el.value || 0),
      base = saleTotals(state.products, state.cart).total;
    if (
      !/^\d*(\.\d{0,2})?$/.test(el.value) ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > base
    ) {
      state.error = "Discount must be within the sale total.";
      state.discountError = state.error;
      el.setCustomValidity(state.error);
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    state.discountError = "";
    state.discount = value;
    state.payment.confirmed = false;
    state.error = "";
    draw();
    return;
  }
  const map = {
    "pos-received": "received",
    "pos-cash": "cash",
    "pos-card": "card",
    "pos-bank": "bank",
    "pos-reference": "reference",
  };
  if (map[el.id]) {
    state.payment[map[el.id]] = el.value;
    if (["pos-card", "pos-bank"].includes(el.id))
      state.payment.confirmed = false;
    state.error = "";
    draw();
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.id === "pos-confirmed") {
    state.payment.confirmed = el.checked;
    return;
  }
  if (el.dataset.quantity) {
    try {
      setQuantity(el.dataset.quantity, Number(el.value));
    } catch (error) {
      toast(error.message, true);
      draw();
    }
  }
});
document.addEventListener("focusin", (event) => {
  if (
    ["pos-received", "pos-cash", "pos-card", "pos-bank"].includes(
      event.target.id,
    )
  )
    activeAmount = event.target.id;
});
document.addEventListener("keydown", (event) => {
  if (state.busy) return;
  if (event.key === "F2") {
    event.preventDefault();
    if (state.step !== "payment") {
      state.view = "sell";
      state.step = "sell";
      draw();
      $("#pos-search")?.focus();
    }
  }
  if (event.key === "F4" && !$("#pos-dialog").open) {
    event.preventDefault();
    try {
      pay();
    } catch (error) {
      toast(error.message, true);
    }
  }
  if (
    event.key === "Escape" &&
    state.step === "payment" &&
    !$("#pos-dialog").open
  ) {
    state.step = "sell";
    state.error = "";
    draw();
  }
  if (event.key === "Enter" && event.target.id === "pos-search") {
    event.preventDefault();
    const value = event.target.value.trim().toLowerCase();
    const product = state.products.find((p) =>
      [p.barcode, p.sku].some((code) => code && code.toLowerCase() === value),
    );
    if (!product) {
      toast("No exact barcode or SKU found.", true);
      return;
    }
    try {
      state.search = "";
      add(product.id);
      $("#pos-search")?.focus();
    } catch (error) {
      toast(error.message, true);
    }
  }
});
window.addEventListener("offline", draw);
window.addEventListener("online", () =>
  refresh().catch((error) => toast(error.message, true)),
);
async function boot() {
  try {
    const session = await checked(db.auth.getSession());
    state.user = session.session?.user;
    if (!state.user) {
      location.replace("/admin/#pos");
      return;
    }
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("bp-register-draft-" + state.user.id) || "null",
      );
      if (
        saved?.items?.every(
          (i) =>
            typeof i.id === "string" &&
            Number.isInteger(i.qty) &&
            i.qty > 0 &&
            i.qty <= 999,
        )
      ) {
        state.cart = saved.items;
        state.key = saved.key || uid();
      }
    } catch {}
    await load();
    if (!state.context.can_pos) return;
    draw();
    $("#pos-search")?.focus();
    const sync = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!state.busy) refresh().catch((error) => toast(error.message, true));
      }, 500);
    };
    channel = db
      .channel("bp-register-" + state.user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bp_products" },
        sync,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bp_orders" },
        sync,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bp_staff",
          filter: "user_id=eq." + state.user.id,
        },
        sync,
      )
      .subscribe();
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/admin/sw.js", { scope: "/admin/", updateViaCache: "none" })
        .catch(() => {});
    setInterval(() => {
      if (!document.hidden && !state.busy && navigator.onLine)
        refresh().catch(() => {});
    }, 60000);
    db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") location.replace("/admin/#pos");
    });
  } catch (error) {
    accessError(error.message);
  }
}
boot();
