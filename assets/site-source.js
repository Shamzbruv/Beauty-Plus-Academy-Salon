import { db, esc, money, date, safeURL, checked, toast } from "./core.js";
const $ = (s) => document.querySelector(s);
let rows = [],
  settings = {},
  courses = [],
  services = [];
const of = (kind) => rows.filter((r) => r.kind === kind);
function image(url, alt = "") {
  return `<img src="${esc(safeURL(url, true))}" alt="${esc(alt)}" loading="lazy">`;
}
function card(row, body, action = "") {
  return `<article class="bp-card">${row.data.image ? image(row.data.image, row.data.alt || row.title) : ""}<div class="bp-card-body"><h3>${esc(row.title)}</h3>${body}${action}</div></article>`;
}
function section(id, title, body) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("section");
    el.id = id;
    el.className = "bp-section";
    ($("main") || document.body).append(el);
  }
  el.innerHTML = `<div class="container"><p class="bp-kicker">BEAUTY PLUS • YOUR NEXT CHAPTER</p><h2>${esc(title)}</h2>${body}</div>`;
  return el;
}
function applyPages() {
  const page =
    location.pathname.split("/").pop()?.replace(".html", "") || "index";
  if (settings[page + "_title"]) document.title = settings[page + "_title"];
  if (settings[page + "_description"])
    document
      .querySelector("meta[name=description]")
      ?.setAttribute("content", settings[page + "_description"]);
  for (const r of of("page")) {
    const d = r.data;
    const el = document.querySelector(
      `[data-bp-${d.type === "text" ? "text" : d.type}="${CSS.escape(r.id)}"]`,
    );
    if (!el) continue;
    if (d.type === "text") {
      let value = d.value;
      if (d.binding === "registration_fee")
        value = value.replace(
          /JMD \$[\d,]+/g,
          money(settings.registration_fee),
        );
      if (d.binding === "address") value = settings.address;
      if (d.binding === "service_count") value = String(services.length);
      if (d.binding === "phone")
        value = value.replace(/876-458-0603/g, settings.phone);
      el.textContent = value;
    } else if (d.type === "image") {
      el.hidden = !d.value;
      if (d.value) el.src = safeURL(d.value, true);
      el.alt = d.alt || "";
    } else el.href = safeURL(d.value) || "#";
  }
  document
    .querySelectorAll('a[href^="https://wa.me/18764580603"]')
    .forEach((a) => {
      const u = new URL(a.href);
      u.pathname = "/" + settings.whatsapp;
      a.href = u.href;
    });
  document
    .querySelectorAll('a[href="mailto:forresterpetagay30@gmail.com"]')
    .forEach((a) => (a.href = "mailto:" + settings.email));
  for (const id of settings.hidden_sections || [])
    document.getElementById(id)?.setAttribute("hidden", "");
  document
    .querySelectorAll("[data-bp-section]")
    .forEach(
      (el) =>
        (el.hidden = (settings.hidden_sections || []).includes(
          el.dataset.bpSection,
        )),
    );
}
function nav() {
  const b = $("#menuBtn"),
    p = $("#mobilePanel");
  b?.addEventListener("click", () => {
    p.classList.toggle("open");
    b.setAttribute("aria-expanded", String(p.classList.contains("open")));
  });
  p?.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => p.classList.remove("open")),
  );
  document
    .querySelectorAll(".reveal")
    .forEach((e) => e.classList.add("visible"));
  if ($("#year")) $("#year").textContent = new Date().getFullYear();
  if ($("#royalOrb")) $("#royalOrb").style.display = "none";
  document.querySelectorAll(".nav-links,.mobile-panel").forEach((el) => {
    if (!el.querySelector('[href="events.html"]'))
      el.insertAdjacentHTML("beforeend", '<a href="events.html">Events</a>');
  });
  document
    .querySelector("footer .footer-bottom")
    ?.insertAdjacentHTML(
      "beforeend",
      '<a href="admin/index.html" class="bp-owner-link">Owner sign in</a>',
    );
}
function promoActive(r) {
  const d = r.data,
    now = Date.now(),
    page = location.pathname.split("/").pop() || "index.html";
  return (
    (!d.starts_at || Date.parse(d.starts_at) <= now) &&
    (!d.ends_at || Date.parse(d.ends_at) > now) &&
    (!d.pages?.length || d.pages.includes(page))
  );
}
function promotions() {
  const active = of("promotion").filter(promoActive);
  document.querySelectorAll("[data-bp-promo]").forEach((el) => {
    if (!active.some((r) => r.id === el.dataset.bpPromo)) el.remove();
  });
  for (const r of active) {
    if (document.querySelector(`[data-bp-promo="${CSS.escape(r.id)}"]`))
      continue;
    const d = r.data;
    const body = `${d.image ? image(d.image, r.title) : ""}<div><small>${esc(d.badge || "SPECIAL OFFER")}</small><h3>${esc(r.title)}</h3><p>${esc(d.description)}</p>${d.code ? `<strong>Use code: ${esc(d.code)}</strong>` : ""}${d.url ? `<a class="bp-button" href="${esc(safeURL(d.url))}">${esc(d.button || "Find out more")}</a>` : ""}</div>`;
    if (d.display === "popup") {
      if (sessionStorage.getItem("bp-promo-" + r.id + "-" + r.version))
        continue;
      const modal = document.createElement("dialog");
      modal.className = "bp-dialog";
      modal.dataset.bpPromo = r.id;
      modal.innerHTML = `<button class="bp-close" aria-label="Close offer">×</button>${body}`;
      document.body.append(modal);
      modal.querySelector("button").onclick = () => {
        sessionStorage.setItem("bp-promo-" + r.id + "-" + r.version, "1");
        modal.close();
      };
      modal.addEventListener("close", () =>
        sessionStorage.setItem("bp-promo-" + r.id + "-" + r.version, "1"),
      );
      modal.showModal();
    } else {
      const el = document.createElement("aside");
      el.dataset.bpPromo = r.id;
      el.className = "bp-promotion bp-promo-" + (d.display || "banner");
      el.innerHTML = `${body}<button class="bp-close" aria-label="Dismiss offer">×</button>`;
      el.querySelector("button").onclick = () => el.remove();
      if (d.display === "card") ($("main") || document.body).prepend(el);
      else document.body.append(el);
    }
  }
}
function gallery() {
  for (const [container, category] of [
    ["#salonGallery", "salon"],
    ["#schoolGallery", "academy"],
  ]) {
    const root = $(container);
    if (!root) continue;
    const list = of("gallery").filter((r) => r.data.category === category);
    const render = (r) =>
      `<button type="button" class="bp-gallery-tile" data-gallery="${esc(r.id)}">${image(r.data.image, r.data.alt || r.title)}<span>${esc(r.title)}<small>${esc(r.data.tag)}</small></span></button>`;
    root.innerHTML = list.slice(0, 3).map(render).join("");
    if ($("#fgGrid")) $("#fgGrid").innerHTML = list.map(render).join("");
    $("#viewFullGalleryBtn")?.addEventListener("click", () =>
      $("#fgModal").classList.add("open"),
    );
    $("#fgClose")?.addEventListener("click", () =>
      $("#fgModal").classList.remove("open"),
    );
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gallery]");
    if (!b) return;
    const r = rows.find((x) => x.id === b.dataset.gallery);
    const modal = document.createElement("dialog");
    modal.className = "bp-dialog bp-gallery-dialog";
    modal.innerHTML = `<button class="bp-close" aria-label="Close story">×</button>${image(r.data.image, r.data.alt || r.title)}<h2>${esc(r.title)}</h2><p>${esc(r.data.story || r.data.tag)}</p>`;
    document.body.append(modal);
    modal.querySelector("button").onclick = () => modal.close();
    modal.addEventListener("close", () => modal.remove());
    modal.showModal();
  });
}
function serviceCatalog() {
  if (!$("#serviceGrid")) return;
  let active = "All services";
  const cats = [
    "All services",
    ...new Set(services.map((s) => s.data.category)),
  ];
  const categories = $("#categoryList");
  const price = (s) =>
    s.data.price == null
      ? "Contact salon"
      : (s.data.price_from ? "From " : "") + money(s.data.price);
  const render = () => {
    categories.innerHTML = cats
      .map(
        (c) =>
          `<button type="button" class="category-btn ${c === active ? "active" : ""}" data-category="${esc(c)}">${esc(c)}</button>`,
      )
      .join("");
    const term = $("#serviceSearch").value.toLowerCase();
    $("#activeCategoryTitle").textContent = active;
    $("#activeCategoryDesc").textContent =
      "Explore our services and send a booking request.";
    $("#serviceGrid").innerHTML =
      services
        .filter(
          (s) =>
            (active === "All services" || s.data.category === active) &&
            JSON.stringify([s.title, s.data.description])
              .toLowerCase()
              .includes(term),
        )
        .map(
          (s) =>
            `<button type="button" class="service-card" data-service="${s.id}"><div class="service-top"><h4 class="service-title">${esc(s.title)}</h4><span class="service-price">${esc(price(s))}</span></div><p class="service-meta">${esc(s.data.duration || "By appointment")}</p><p class="service-desc">${esc(s.data.description)}</p><span class="service-action-link">Request an appointment →</span></button>`,
        )
        .join("") || "<p>No services match. Try another search.</p>";
  };
  categories.onclick = (e) => {
    const b = e.target.closest("[data-category]");
    if (b) {
      active = b.dataset.category;
      render();
    }
  };
  $("#serviceSearch").oninput = render;
  $("#bookingService").innerHTML =
    '<option value="">Choose a service</option>' +
    services
      .map(
        (s) =>
          `<option value="${s.id}">${esc(s.title)} — ${esc(price(s))}</option>`,
      )
      .join("");
  $("#serviceGrid").onclick = (e) => {
    const b = e.target.closest("[data-service]");
    if (b) {
      $("#bookingService").value = b.dataset.service;
      $("#bookingService").dispatchEvent(new Event("change"));
      $("#book").scrollIntoView({ behavior: "smooth" });
    }
  };
  $("#bookingService").onchange = () => {
    const s = services.find((s) => s.id === $("#bookingService").value);
    $("#depositContainer").style.display = s ? "block" : "none";
    if (s) {
      $("#bookingSelectedService").textContent = s.title;
      $("#bookingSelectedMeta").textContent = price(s);
      $("#depositAmountDisplay").textContent = money(
        s.data.price == null
          ? settings.variable_deposit
          : (s.data.price * settings.deposit_percent) / 100,
      );
    }
  };
  $("#depositContainer p").textContent =
    `${settings.deposit_percent}% deposit requested. Appointment subject to confirmation.`;
  $("#bookingDate").min = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  render();
}
function courseCatalog() {
  if (!$("#coursesGrid")) return;
  let filter = "all";
  const render = () => {
    $("#coursesGrid").innerHTML =
      courses
        .filter((c) => filter === "all" || c.data.category === filter)
        .map(
          (c) =>
            `<article class="course-card"><div class="course-card-top"><div class="course-cat-icon">✦</div><div class="course-price-badge"><strong>${money(c.data.price)}</strong></div></div><div class="course-card-body"><h3>${esc(c.title)}</h3><p>${esc(c.data.description)}</p><div class="course-tags"><span>${esc(c.data.start)}</span><span>${esc(c.data.schedule)}</span></div><button type="button" class="course-enroll-btn" data-course="${c.id}">Choose this course →</button></div></article>`,
        )
        .join("") || "<p>No courses available in this category.</p>";
  };
  $("#courseFilters").innerHTML = [
    "all",
    ...new Set(courses.map((c) => c.data.category)),
  ]
    .map(
      (c) =>
        `<button type="button" class="course-filter ${c === filter ? "active" : ""}" data-filter="${esc(c)}">${esc(c === "all" ? "All courses" : c)}</button>`,
    )
    .join("");
  $("#courseFilters").onclick = (e) => {
    const b = e.target.closest("[data-filter]");
    if (b) {
      filter = b.dataset.filter;
      $("#courseFilters")
        .querySelectorAll("button")
        .forEach((x) => x.classList.toggle("active", x === b));
      render();
    }
  };
  $("#coursesGrid").onclick = (e) => {
    const b = e.target.closest("[data-course]");
    if (b) {
      $("#courseSelect").value = b.dataset.course;
      update();
      $("#register").scrollIntoView({ behavior: "smooth" });
    }
  };
  const options =
    '<option value="">Choose a course</option>' +
    courses
      .map(
        (c) =>
          `<option value="${c.id}">${esc(c.title)} — ${money(c.data.price)}</option>`,
      )
      .join("");
  $("#courseSelect").innerHTML = options;
  $("#tCourseSelect").innerHTML = options;
  function update() {
    const c = courses.find((c) => c.id === $("#courseSelect").value);
    $("#summaryCourse").textContent = c?.title || "Not selected";
    $("#writtenTime").value = c?.data.schedule || "";
    $("#summaryTime").textContent = c?.data.schedule || "Not selected";
    $("#kitOptionContainer").style.display = c?.data.kit_price
      ? "block"
      : "none";
    $("#kitOptionText").textContent =
      "Include training kit — " + money(c?.data.kit_price);
    $("#summaryPrice").textContent = money(
      c?.data.kit_price && $("#kitOption").checked
        ? c.data.kit_price
        : c?.data.price,
    );
    document.querySelectorAll('[name="approach"]').forEach((x) => {
      x.disabled = !c?.data.flexible;
      x.required = !!c?.data.flexible;
    });
    $("#approachHint").textContent = c?.data.flexible
      ? "Choose online or face-to-face study."
      : "This course follows the listed class schedule.";
  }
  $("#courseSelect").onchange = () => {
    $("#kitOption").checked = false;
    update();
  };
  $("#kitOption").onchange = update;
  function tuition() {
    const c = courses.find((c) => c.id === $("#tCourseSelect").value);
    $("#tKitOptionContainer").style.display = c?.data.kit_price
      ? "block"
      : "none";
    $("#tKitOptionText").textContent =
      "Include training kit — " + money(c?.data.kit_price);
    const max =
      c?.data.kit_price && $("#tKitOption").checked
        ? c.data.kit_price
        : c?.data.price || 0;
    $("#tAmount").max = max;
    $("#tAmount").readOnly =
      $('[name="tPaymentType"]:checked').value === "full";
    if ($("#tAmount").readOnly) $("#tAmount").value = max;
  }
  $("#tCourseSelect").onchange = () => {
    $("#tKitOption").checked = false;
    tuition();
  };
  $("#tKitOption").onchange = tuition;
  document
    .querySelectorAll('[name="tPaymentType"]')
    .forEach((e) => (e.onchange = tuition));
  render();
  update();
}
function paymentFields(form) {
  const enabled = (settings.payments || []).filter((p) => p.enabled);
  const box = document.createElement("div");
  box.className = "bp-payment-fields";
  box.innerHTML = `<label>How would you like to pay?<select name="bp_payment" required><option value="">Choose payment method</option>${enabled.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("")}</select></label><p class="bp-payment-help">Select a method to see the instructions.</p><label>Payment reference (if already sent)<input name="bp_reference" maxlength="200" placeholder="Optional — the team will check it"></label><label class="bp-consent"><input type="checkbox" required> I agree to be contacted about this request and accept the cancellation and privacy information below.</label><p class="bp-small">${esc(settings.cancellation_policy)} ${esc(settings.privacy_policy)}</p><label class="bp-trap" aria-hidden="true">Leave empty<input name="bp_website" tabindex="-1" autocomplete="off"></label>`;
  form.querySelector('button[type="submit"]')?.before(box);
  box.querySelector("select").onchange = (e) => {
    const p = enabled.find((x) => x.id === e.target.value);
    box.querySelector(".bp-payment-help").textContent =
      p?.instructions ||
      "Secure payment instructions will be shown after you submit. Payment is checked by the salon.";
  };
}
async function submit(form, record) {
  const button = form.querySelector('[type="submit"]'),
    old = button.textContent;
  button.disabled = true;
  button.textContent = "Saving your request…";
  try {
    const fd = new FormData(form);
    if (fd.get("bp_website"))
      throw new Error("Please leave the website field empty.");
    const id = crypto.randomUUID();
    record.id = id;
    record.payment_method = String(fd.get("bp_payment") || "");
    record.data = {
      ...record.data,
      payment_reference: fd.get("bp_reference") || "",
    };
    await checked(db.from("bp_submissions").insert(record));
    const quote = await checked(db.rpc("bp_request_quote", { p_id: id }));
    if (!quote?.length)
      throw new Error(
        "Your request is saved. Please contact the salon with reference " +
          id +
          " for payment instructions.",
      );
    record.amount = quote[0].amount;
    const waitlisted = quote[0].status === "waitlisted";
    const p = waitlisted
      ? null
      : settings.payments.find((p) => p.id === record.payment_method);
    let url =
      !p || ["bank", "cash"].includes(p.provider)
        ? ""
        : record.data?.payment_links?.[p.provider] ||
          (p.provider === "custom" ? record.data?.payment_url : "") ||
          p?.url;
    form.reset();
    const d = document.createElement("dialog");
    d.className = "bp-dialog";
    d.innerHTML = `<button class="bp-close" aria-label="Close confirmation">×</button><p class="bp-kicker">REQUEST RECEIVED</p><h2>Thank you, ${esc(record.name.split(" ")[0])}.</h2><p>Your reference is <strong>${esc(id)}</strong>. Keep this for payment and follow-up.</p><p>${record.kind === "event" ? (waitlisted ? "You are on the waitlist. Please wait for the team to offer a place before paying." : "Your registration is saved. The team will confirm your place.") : "The team will review your request and confirm availability."}</p><p>${esc(waitlisted ? "No payment is requested while you are on the waitlist." : p?.instructions || (Number(record.amount) === 0 ? "No payment is required for this request." : "Contact the salon to complete payment."))}</p><p><strong>${waitlisted ? "Waitlisted — please wait before paying." : Number(record.amount) === 0 ? "No payment required." : "Amount requested: " + money(record.amount) + " • awaiting verification."}</strong> A request or payment link is not proof of payment.</p><div id="bp-payment-action"></div><a class="bp-button" target="_blank" rel="noopener" href="https://wa.me/${esc(settings.whatsapp)}?text=${encodeURIComponent("Hello, my Beauty Plus request is " + id + ". Please confirm my place and payment instructions. Name: " + record.name)}">Contact Beauty Plus</a>`;
    document.body.append(d);
    d.querySelector("button").onclick = () => d.close();
    d.addEventListener("close", () => d.remove());
    d.showModal();
    const action = d.querySelector("#bp-payment-action");
    if (url && safeURL(url)) {
      action.innerHTML = `<a class="bp-button" href="${esc(safeURL(url))}" target="_blank" rel="noopener">Open secure ${esc(p.label)} payment page ↗</a><p>Check the amount and use your reference. The salon verifies payment.</p>`;
    } else if (p?.provider === "wipay" && p.account_number) {
      action.innerHTML =
        '<button type="button" class="bp-button">Pay securely with WiPay ↗</button>';
      action.querySelector("button").onclick = async (e) => {
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
                account_number: p.account_number,
                country_code: "JM",
                currency: "JMD",
                environment: "live",
                fee_structure: p.fee_structure || "customer_pay",
                method: "credit_card",
                order_id: id,
                origin: "BeautyPlus",
                response_url: location.origin + "/payment-return.html",
                total: Number(record.amount).toFixed(2),
              }),
            },
          );
          const body = await r.json();
          if (
            !body.url ||
            !new URL(body.url).hostname.endsWith(".wipayfinancial.com")
          )
            throw new Error(
              "Please contact the salon for a secure payment link. Your request is saved.",
            );
          location.href = body.url;
        } catch (err) {
          toast(err.message, true);
          e.target.disabled = false;
        }
      };
    }
  } catch (e) {
    toast(
      e.message.includes("duplicate")
        ? "You have already registered with this email. Contact us to update your registration."
        : e.message,
      true,
    );
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}
function wireForms() {
  for (const [id, kind] of [
    ["bookingForm", "booking"],
    ["registrationForm", "enrollment"],
    ["tuitionForm", "tuition"],
  ]) {
    const f = document.getElementById(id);
    if (!f) continue;
    paymentFields(f);
    f.querySelector('button[type="submit"]').textContent =
      kind === "tuition"
        ? "Save payment request"
        : "Send " +
          (kind === "booking" ? "booking request" : "enrollment request");
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      let record;
      if (kind === "booking") {
        const s = services.find((x) => x.id === d.bookingService);
        record = {
          kind,
          content_id: s.id,
          name: d.bookingName,
          email: d.bookingEmail,
          phone: d.bookingPhone,
          amount:
            s.data.price == null
              ? settings.variable_deposit
              : (s.data.price * settings.deposit_percent) / 100,
          data: {
            item: s.title,
            date: d.bookingDate,
            time: d.bookingTime,
            notes: d.bookingNotes,
            preferred_contact: d.bookingContactMethod,
            payment_url: s.data.payment_url || "",
            payment_links: {
              wipay: s.data.wipay_link || "",
              fygaro: s.data.fygaro_link || "",
              ncb: s.data.ncb_link || "",
            },
          },
        };
      } else {
        const c = courses.find(
          (x) =>
            x.id === (kind === "tuition" ? d.tCourseSelect : d.courseSelect),
        );
        record = {
          kind,
          content_id: c.id,
          name:
            kind === "tuition"
              ? `${d.tFirstName} ${d.tLastName}`
              : `${d.firstName} ${d.lastName}`,
          email: kind === "tuition" ? d.tEmail : d.email,
          phone: kind === "tuition" ? d.tPhone : d.phone,
          amount:
            kind === "tuition" ? Number(d.tAmount) : settings.registration_fee,
          data: {
            item: c.title,
            schedule: c.data.schedule,
            kit: kind === "tuition" ? !!d.tKitOption : !!d.kitOption,
            approach: d.approach || "Scheduled class",
            notes: d.notes || "",
            address: [d.street1, d.street2, d.city, d.state, d.zip]
              .filter(Boolean)
              .join(", "),
            payment_url: c.data.payment_url || "",
            payment_links: {
              wipay: c.data.wipay_link || "",
              fygaro: c.data.fygaro_link || "",
              ncb: c.data.ncb_link || "",
            },
          },
        };
      }
      submit(f, record);
    };
  }
}
function eventSignup(r) {
  const d = r.data;
  const modal = document.createElement("dialog");
  modal.className = "bp-dialog";
  modal.innerHTML = `<button class="bp-close" aria-label="Close registration">×</button><p class="bp-kicker">EVENT REGISTRATION</p><h2>${esc(r.title)}</h2><p>${esc(d.form_intro || "Reserve your place below.")}</p><form id="bp-event-form"><label>Full name<input name="name" required minlength="2" maxlength="200" autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Phone / WhatsApp<input name="phone" required maxlength="60" autocomplete="tel"></label>${(d.fields || []).map((f) => `<label>${esc(f.label)} ${f.required ? "*" : ""}${f.type === "select" ? `<select name="field_${esc(f.id)}" ${f.required ? "required" : ""}><option value="">Choose an option</option>${(f.options || []).map((o) => `<option>${esc(o)}</option>`).join("")}</select>` : f.type === "textarea" ? `<textarea name="field_${esc(f.id)}" maxlength="3000" ${f.required ? "required" : ""}></textarea>` : `<input name="field_${esc(f.id)}" type="${["email", "tel", "date", "number", "checkbox"].includes(f.type) ? f.type : "text"}" value="${f.type === "checkbox" ? "true" : ""}" ${f.required ? "required" : ""} ${f.type === "checkbox" ? "" : 'maxlength="3000"'}>`}</label>`).join("")}<button type="submit" class="bp-button">Send registration${d.price ? " • " + money(d.price) : ""}</button></form>`;
  document.body.append(modal);
  const form = modal.querySelector("form");
  if (d.price > 0) paymentFields(form);
  else {
    form.querySelector('button[type="submit"]').before(
      Object.assign(document.createElement("p"), {
        textContent: settings.privacy_policy,
      }),
    );
  }
  modal.querySelector(".bp-close").onclick = () => modal.close();
  modal.addEventListener("close", () => modal.remove());
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const answers = Object.fromEntries(
      (d.fields || []).map((f) => [f.id, fd.get("field_" + f.id) || ""]),
    );
    await submit(form, {
      kind: "event",
      content_id: r.id,
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      amount: d.price || 0,
      data: {
        item: r.title,
        answers,
        payment_url: d.payment_url || "",
        payment_links: {
          wipay: d.wipay_link || "",
          fygaro: d.fygaro_link || "",
          ncb: d.ncb_link || "",
        },
      },
    });
  };
  modal.showModal();
}
function events() {
  const list = of("event").filter(
    (r) => !r.data.starts_at || Date.parse(r.data.starts_at) > Date.now(),
  );
  const full = location.pathname.endsWith("events.html");
  section(
    "bp-events",
    full ? "Something beautiful is happening." : "Join us at Beauty Plus",
    `<p class="bp-intro">Workshops, beauty experiences, and opportunities to grow. Find your next event.</p><div class="bp-grid">${list.map((r) => card(r, `<p>${esc(r.data.description)}</p><p>${date(r.data.starts_at)} • ${esc(r.data.location)}</p><strong>${r.data.price ? money(r.data.price) : "Free entry"}</strong>`, `<button class="bp-button" data-event="${r.id}" ${r.data.registration_open === false || (r.data.registration_deadline && Date.parse(r.data.registration_deadline) < Date.now()) ? "disabled" : ""}>${r.data.registration_open === false ? "Registration closed" : "View registration form →"}</button>`)).join("") || "<p>New events will be announced here. Check back soon.</p>"}</div>`,
  );
  document
    .querySelectorAll("[data-event]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          eventSignup(rows.find((r) => r.id === b.dataset.event))),
    );
}
function extras() {
  if ($("#bp-home-courses"))
    $("#bp-home-courses").innerHTML = courses
      .slice(0, 8)
      .map(
        (c) =>
          `<p style="display:flex;justify-content:space-between;gap:15px;padding:12px 0;border-bottom:1px solid #ddd"><span>${esc(c.title)}</span><strong>${money(c.data.price)}</strong></p>`,
      )
      .join("");
  const stories = of("gallery").filter((r) => r.data.story);
  if (stories.length)
    section(
      "bp-stories",
      "Every look has a story.",
      `<div class="bp-grid">${stories.map((r) => card(r, `<p>${esc(r.data.story)}</p>`)).join("")}</div>`,
    );
  if (of("testimonial").length)
    section(
      "bp-reviews",
      "Kind words from our community",
      `<div class="bp-grid">${of("testimonial")
        .map((r) =>
          card(
            r,
            `<p>“${esc(r.data.quote)}”</p><small>${esc(r.data.role)}</small>`,
          ),
        )
        .join("")}</div>`,
    );
  if (of("faq").length)
    section(
      "bp-faq",
      "A little clarity, before you book.",
      of("faq")
        .map(
          (r) =>
            `<details><summary>${esc(r.title)}</summary><p>${esc(r.data.answer)}</p></details>`,
        )
        .join(""),
    );
  section(
    "bp-business",
    "Visit, connect, feel beautiful.",
    `<p>${esc(settings.address)}</p><p>${esc(settings.hours)}</p><a href="tel:${esc(settings.phone)}">${esc(settings.phone)}</a> · <a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a><details><summary>Cancellation & privacy information</summary><p>${esc(settings.cancellation_policy)}</p><p>${esc(settings.privacy_policy)}</p></details>`,
  );
}
async function boot() {
  nav();
  try {
    rows = await checked(
      db
        .from("bp_content")
        .select("*")
        .eq("status", "published")
        .order("sort_order"),
    );
    settings = rows.find((r) => r.id === "site-settings")?.data || {};
    services = of("service");
    courses = of("course");
    applyPages();
    serviceCatalog();
    courseCatalog();
    gallery();
    wireForms();
    events();
    extras();
    applyPages();
    promotions();
    setInterval(promotions, 60000);
    window.dispatchEvent(new Event("bp-ready"));
  } catch (e) {
    console.error("Website content unavailable", e);
    document.querySelectorAll('form button[type="submit"]').forEach((b) => {
      b.disabled = true;
      b.textContent = "Temporarily unavailable — please contact the salon";
    });
    toast(
      "We could not load live content. Please refresh or contact Beauty Plus.",
      true,
    );
  }
}
boot();
