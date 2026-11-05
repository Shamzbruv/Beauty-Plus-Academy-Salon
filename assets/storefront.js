import { db, esc, money, date, safeURL, checked, toast } from "./core.js";
const $ = (s) => document.querySelector(s),
  cmd = (a, p = {}) => checked(db.rpc("bp_command", { p_action: a, p })),
  uid = () => crypto.randomUUID(),
  round = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
let products = [],
  deliveries = [],
  cart = [],
  key = uid(),
  settings = {},
  shop = {},
  filter = "",
  search = "";
function totals() {
  const lines = cart
    .map((c) => {
      const p = products.find((x) => x.id === c.id);
      if (!p) return null;
      const net = round(p.price * c.qty);
      return { ...p, qty: c.qty, net, tax: round((net * p.tax_rate) / 100) };
    })
    .filter(Boolean);
  return {
    lines,
    subtotal: round(lines.reduce((n, l) => n + l.net, 0)),
    tax: round(lines.reduce((n, l) => n + l.tax, 0)),
    total: round(lines.reduce((n, l) => n + l.net + l.tax, 0)),
  };
}
const img = (p) =>
  p.image
    ? `<img src="${esc(safeURL(p.image, true))}" alt="${esc(p.name)}" loading="lazy">`
    : '<div class="shop-placeholder">b<span>+</span></div>';
function draw() {
  const t = totals();
  $("#shop-root").innerHTML =
    `<section class="shop-hero"><div><p class="bp-kicker">THE BEAUTY PLUS STORE</p><h1>${esc(shop.shop_title || "The Beauty Plus edit.")}</h1><p>${esc(shop.shop_intro || "Your beauty essentials, thoughtfully selected.")}</p><div class="shop-benefits"><span>✦ Curated beauty essentials</span><span>↗ Delivery & collection</span><span>✓ Clear prices. A personal touch.</span></div></div><button type="button" class="shop-bag" data-shop="cart">Your bag <span>${cart.reduce((n, c) => n + c.qty, 0)}</span></button></section><div class="shop-toolbar"><input id="shop-search" type="search" placeholder="Find your next favourite…" value="${esc(search)}" aria-label="Search products"><div class="shop-filters"><button data-shop="filter" data-category="" class="${!filter ? "active" : ""}">All essentials</button>${[...new Set(products.map((p) => p.category))].map((c) => `<button data-shop="filter" data-category="${esc(c)}" class="${filter === c ? "active" : ""}">${esc(c)}</button>`).join("")}</div></div><section class="shop-products">${
      products
        .filter(
          (p) =>
            (!filter || p.category === filter) &&
            [p.name, p.description, p.sku]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .map(
          (p) =>
            `<article class="shop-product"><button class="shop-product-image" data-shop="detail" data-id="${p.id}">${img(p)}${p.track_stock && p.stock_qty <= 0 ? '<span class="shop-sold">Back soon</span>' : ""}</button><div class="shop-product-info"><small>${esc(p.category)}</small><h2>${esc(p.name)}</h2><p>${money(p.price)}${Number(p.tax_rate) > 0 ? ` <small>+ ${p.tax_rate}% tax</small>` : ""}</p><button type="button" class="bp-button" data-shop="add" data-id="${p.id}" ${p.track_stock && p.stock_qty <= 0 ? "disabled" : ""}>Add to bag +</button></div></article>`,
        )
        .join("") ||
      '<div class="shop-empty"><h2>Something beautiful is on its way.</h2><p>Our product collection will appear here soon. Contact Beauty Plus if there’s something you’re looking for.</p></div>'
    }</section><aside class="shop-delivery-note"><h2>Made easy, from checkout to collection.</h2><p>Choose from the delivery and collection options offered at checkout. Your invoice keeps every detail together.</p><div>${deliveries.map((d) => `<span>${esc(d.name)} · ${d.fee ? money(d.fee) : "Free"}${d.free_over ? " · Free over " + money(d.free_over) : ""}</span>`).join("")}</div></aside>`;
  $("#shop-search").oninput = (e) => {
    search = e.target.value;
    const pos = e.target.selectionStart;
    draw();
    $("#shop-search").focus();
    $("#shop-search").setSelectionRange(pos, pos);
  };
}
function add(id) {
  const p = products.find((p) => p.id === id),
    c = cart.find((c) => c.id === id);
  if (p.track_stock && (c?.qty || 0) >= p.stock_qty) {
    toast("This product has no more stock available.", true);
    return;
  }
  if (c) c.qty++;
  else cart.push({ id, qty: 1 });
  draw();
  toast("Added to your bag.");
}
function openDialog(title, body) {
  const d = document.createElement("dialog");
  d.className = "bp-dialog shop-dialog";
  d.innerHTML = `<button class="bp-close" aria-label="Close">×</button><h2>${title}</h2>${body}`;
  document.body.append(d);
  d.querySelector(".bp-close").onclick = () => d.close();
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}
function showCart() {
  const t = totals();
  const d = openDialog(
    "Your beauty bag.",
    `<div class="shop-cart-lines">${t.lines.map((l) => `<div><div><strong>${esc(l.name)}</strong><small>${money(l.price)} each</small><div class="shop-qty"><button data-cart="minus" data-id="${l.id}">−</button><b>${l.qty}</b><button data-cart="plus" data-id="${l.id}">+</button></div></div><b>${money(l.net)}</b></div>`).join("") || "<p>Your bag is waiting for something lovely.</p>"}</div><div class="shop-cart-total"><p><span>Subtotal</span><b>${money(t.subtotal)}</b></p><p><span>Tax</span><b>${money(t.tax)}</b></p><p><span>Total before delivery</span><b>${money(t.total)}</b></p></div><button class="bp-button" id="shop-checkout" ${!cart.length ? "disabled" : ""}>Continue to checkout →</button>`,
  );
  d.querySelectorAll("[data-cart]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = cart.find((c) => c.id === b.dataset.id),
          p = products.find((p) => p.id === c.id);
        if (b.dataset.cart === "minus") c.qty--;
        else {
          if (p.track_stock && c.qty >= p.stock_qty) {
            toast("No more stock available.", true);
            return;
          }
          c.qty++;
        }
        cart = cart.filter((c) => c.qty > 0);
        d.close();
        draw();
        showCart();
      }),
  );
  d.querySelector("#shop-checkout").onclick = () => {
    d.close();
    checkout();
  };
}
function checkout() {
  const t = totals(),
    methods = (settings.payments || []).filter((p) => p.enabled);
  const d = openDialog(
    "A little beauty, made yours.",
    `<form id="shop-checkout-form"><div class="shop-form-grid"><label>Full name<input name="name" required minlength="2" maxlength="200" autocomplete="name"></label><label>Email for your invoice<input name="email" type="email" required autocomplete="email"></label><label>Phone / WhatsApp<input name="phone" type="tel" required minlength="7" maxlength="60"></label><label>Delivery / collection<select name="delivery_id" required><option value="">Choose an option</option>${deliveries.map((o) => `<option value="${o.id}">${esc(o.name)} · ${money(o.fee)}</option>`).join("")}</select></label><label id="checkout-area">Area / parish<select name="area"><option value="">Choose a delivery option first</option></select></label><label id="checkout-address">Delivery address<textarea name="address" maxlength="2000" autocomplete="street-address"></textarea></label><label>Payment method<select name="payment_method" required><option value="">Choose how to pay</option>${methods.map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join("")}</select></label><label>Note for the team<textarea name="notes" maxlength="3000"></textarea></label></div><div class="notice" id="checkout-delivery-info">Choose delivery or collection for instructions.</div><p id="checkout-payment-info"></p><div class="shop-cart-total"><p><span>Products + tax</span><b>${money(t.total)}</b></p><p><span>Delivery</span><b id="checkout-shipping">${money(0)}</b></p><p><span>Order total</span><b id="checkout-grand">${money(t.total)}</b></p></div><label class="bp-consent"><input type="checkbox" required>I accept the store terms and consent to being contacted about this order.</label><p class="bp-small">${esc(shop.store_terms || "The team confirms stock, payment, and fulfilment.")} ${esc(settings.privacy_policy || "")}</p><button type="submit" class="bp-button">Place order & get invoice →</button></form>`,
  );
  const f = d.querySelector("form");
  f.elements.delivery_id.onchange = () => {
    const method = deliveries.find(
      (x) => x.id === f.elements.delivery_id.value,
    );
    const shipping = method
      ? method.free_over != null && t.subtotal >= method.free_over
        ? 0
        : Number(method.fee)
      : 0;
    d.querySelector("#checkout-shipping").textContent = money(shipping);
    d.querySelector("#checkout-grand").textContent = money(t.total + shipping);
    d.querySelector("#checkout-delivery-info").textContent = [
      method?.estimate,
      method?.instructions,
    ]
      .filter(Boolean)
      .join("\n");
    const areas = method?.areas || [];
    f.elements.area.innerHTML = areas.length
      ? '<option value="">Choose your area</option>' +
        areas.map((a) => `<option>${esc(a)}</option>`).join("")
      : '<option value="">All covered areas</option>';
    f.elements.area.required = areas.length > 0;
    const delivery = method && method.type !== "pickup";
    d.querySelector("#checkout-address").hidden = !delivery;
    d.querySelector("#checkout-area").hidden = !delivery;
    f.elements.address.required = !!delivery;
  };
  f.elements.payment_method.onchange = () => {
    const m = methods.find((m) => m.id === f.elements.payment_method.value);
    d.querySelector("#checkout-payment-info").textContent =
      m?.instructions || "";
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = f.querySelector("[type=submit]");
    b.disabled = true;
    b.textContent = "Saving your order…";
    try {
      const p = Object.fromEntries(new FormData(f)),
        result = await cmd("order", { ...p, items: cart, key });
      cart = [];
      key = uid();
      d.close();
      draw();
      const method = methods.find((m) => m.id === p.payment_method);
      const confirmation = openDialog(
        "Your order is with us.",
        `<p>Thank you, ${esc(p.name)}. Keep your reference <strong>BP-${String(result.number).padStart(6, "0")}</strong>.</p><p>Total: <strong>${money(result.total)}</strong>. Payment is awaiting verification.</p><a class="bp-button" href="/invoice.html?token=${result.access_token}" target="_blank" rel="noopener">View & download your invoice</a><p>${esc(method?.instructions || "Contact the salon to complete payment.")}</p><div id="shop-pay-action"></div><a class="bp-button" href="https://wa.me/${esc(settings.whatsapp)}?text=${encodeURIComponent("Hello, please confirm my Beauty Plus order BP-" + String(result.number).padStart(6, "0"))}" target="_blank" rel="noopener">Contact Beauty Plus</a>`,
      );
      attachPayment(
        confirmation.querySelector("#shop-pay-action"),
        method,
        result.total,
        result.order_id,
      );
    } catch (err) {
      toast(err.message, true);
      b.disabled = false;
      b.textContent = "Place order & get invoice →";
    }
  };
}
export function attachPayment(container, method, total, reference) {
  if (!method || Number(total) <= 0) return;
  if (method.url && /^https:\/\//.test(method.url)) {
    container.innerHTML = `<a class="bp-button" href="${esc(safeURL(method.url))}" target="_blank" rel="noopener">Open secure payment page ↗</a>`;
  } else if (method.provider === "wipay" && method.account_number) {
    container.innerHTML =
      '<button type="button" class="bp-button">Pay securely with WiPay ↗</button>';
    container.querySelector("button").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await fetch(
          "https://jm.wipayfinancial.com/plugins/payments/request",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              account_number: method.account_number,
              country_code: "JM",
              currency: "JMD",
              environment: "live",
              fee_structure: method.fee_structure || "customer_pay",
              method: "credit_card",
              order_id: reference,
              origin: "BeautyPlusStore",
              response_url: location.origin + "/payment-return.html",
              total: Number(total).toFixed(2),
            }),
          },
        );
        const result = await r.json();
        if (
          !result.url ||
          !new URL(result.url).hostname.endsWith(".wipayfinancial.com")
        )
          throw new Error(
            "Please contact Beauty Plus for your payment link. Your order is already saved.",
          );
        location.href = result.url;
      } catch (err) {
        toast(err.message, true);
        e.target.disabled = false;
      }
    };
  }
}
export async function initStore(args) {
  settings = args.settings;
  shop = args.shop || {};
  document.querySelectorAll(".nav-links,.mobile-panel").forEach((n) => {
    if (!n.querySelector('[href="shop.html"]'))
      n.insertAdjacentHTML("beforeend", '<a href="shop.html">Shop</a>');
  });
  if ($("#home-shop")) {
    if (shop.shop_title) $("#home-shop-title").textContent = shop.shop_title;
    if (shop.shop_intro) $("#home-shop-intro").textContent = shop.shop_intro;
    checked(
      db
        .from("bp_products")
        .select("id,name,category,price,tax_rate,image")
        .eq("status", "published")
        .order("sort_order")
        .limit(3),
    )
      .then((items) => {
        $("#home-shop-products").innerHTML = items.length
          ? items
              .map(
                (p) =>
                  `<a class="home-shop-product" href="shop.html">${img(p)}<div><small>${esc(p.category)}</small><h3>${esc(p.name)}</h3><strong>${money(p.price)}${Number(p.tax_rate) > 0 ? " + tax" : ""}</strong><span>View in the shop →</span></div></a>`,
              )
              .join("")
          : '<p class="home-store-note">The collection is being prepared. Published products will appear here as the salon adds them. <a href="shop.html">Explore the store →</a></p>';
      })
      .catch(() => {});
  }
  if ($("#shop-root")) {
    [products, deliveries] = await Promise.all([
      checked(
        db
          .from("bp_products")
          .select("*")
          .eq("status", "published")
          .order("sort_order"),
      ),
      checked(db.from("bp_deliveries").select("*").eq("active", true)),
    ]);
    draw();
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-shop]");
      if (!b) return;
      const a = b.dataset.shop;
      if (a === "add") add(b.dataset.id);
      if (a === "cart") showCart();
      if (a === "filter") {
        filter = b.dataset.category;
        draw();
      }
      if (a === "detail") {
        const p = products.find((p) => p.id === b.dataset.id);
        const d = openDialog(
          esc(p.name),
          `${img(p)}<p>${esc(p.description)}</p><strong>${money(p.price)}</strong>${Number(p.tax_rate) > 0 ? `<small> + ${p.tax_rate}% tax</small>` : ""}<p>${p.track_stock ? (p.stock_qty > 0 ? "In stock" : "Back soon") : "Available"}</p><button class="bp-button" id="detail-add" ${p.track_stock && p.stock_qty <= 0 ? "disabled" : ""}>Add to bag +</button>`,
        );
        d.querySelector("#detail-add").onclick = () => {
          add(p.id);
          d.close();
        };
      }
    });
  }
  if ($("#bookingForm")) {
    const select = $("#bookingTime"),
      day = $("#bookingDate"),
      service = $("#bookingService");
    select.innerHTML =
      '<option value="">Choose your service and date first</option>';
    let version = 0;
    const load = async () => {
      const current = ++version;
      if (!day.value || !service.value) return;
      select.disabled = true;
      select.innerHTML = '<option value="">Checking available times…</option>';
      try {
        const slots = await cmd("slots", {
          date: day.value,
          service_id: service.value,
        });
        if (current !== version) return;
        select.innerHTML = slots.length
          ? '<option value="">Choose an available time</option>' +
            slots.map((t) => `<option>${t}</option>`).join("")
          : '<option value="">No times available — choose another date</option>';
      } catch (e) {
        select.innerHTML =
          '<option value="">Could not load times — try again</option>';
        toast(e.message, true);
      } finally {
        select.disabled = false;
      }
    };
    day.addEventListener("change", load);
    service.addEventListener("change", load);
    $("#book .section-heading p").textContent =
      "Choose your service, find an available time, and send your request. Your invoice keeps your deposit and balance clear.";
    $("#book .section-heading h2").textContent =
      "Your next beautiful moment starts here.";
    $("#book .form-card").insertAdjacentHTML(
      "afterbegin",
      '<div class="booking-steps"><span><b>1</b> Choose your service</span><span><b>2</b> Find your time</span><span><b>3</b> Get your invoice</span></div>',
    );
  }
}
