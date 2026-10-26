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
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  editor = $("#editor");
let content = [],
  submissions = [],
  user = null,
  active = location.hash.slice(1) || "dashboard",
  viewFilter = "active",
  search = "",
  pageFilter = "index",
  sectionFilter = "",
  requestEvent = "",
  requestStatus = "",
  accountRecovery = false;
const icon = (name = "grid") => {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
    book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16",
    tag: "M3 3h8l10 10-8 8L3 11z M7 7h.01",
    calendar: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16",
    users:
      "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-3a4 4 0 0 0-3-4 M16 2a4 4 0 0 1 0 8",
    image: "M3 3h18v18H3z M3 17l6-7 5 5 3-3 4 5 M16 7h.01",
    card: "M3 5h18v14H3z M3 10h18 M6 15h4",
    settings: "M4 5h16 M4 12h16 M4 19h16 M8 2v6 M16 9v6 M9 16v6",
    arrow: "M4 12h16 M14 6l6 6-6 6",
    globe:
      "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
    clock: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M12 7v5l4 2",
    check: "m5 12 4 4L19 6",
    plus: "M12 4v16 M4 12h16",
    logout: "M9 4H4v16h5 M9 12h12 M16 7l5 5-5 5",
    menu: "M3 5h18 M3 12h18 M3 19h18",
    download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
    mail: "M3 5h18v14H3z m0 0 9 8 9-8",
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(
    paths[name] || paths.grid
  )
    .split(" M")
    .map((p, i) => `<path d="${i ? "M" : ""}${p}"/>`)
    .join("")}</svg>`;
};
const sections = [
  ["dashboard", "Overview", "grid", "STUDIO"],
  ["pages", "Website pages", "globe"],
  ["service", "Salon services", "spark"],
  ["course", "Training & courses", "book"],
  ["promotion", "Specials & promotions", "tag"],
  ["event", "Events & forms", "calendar"],
  ["gallery", "Gallery & stories", "image"],
  ["registrations", "Event registrations", "users", "YOUR COMMUNITY"],
  ["bookings", "Booking requests", "calendar"],
  ["students", "Students & tuition", "book"],
  ["testimonials", "Reviews & FAQs", "spark"],
  ["payments", "Payment methods", "card", "SETTINGS"],
  ["settings", "Business settings", "settings"],
  ["history", "Activity & backups", "clock"],
];
const descriptions = {
  dashboard:
    "A calm place to run your business. Everything you need, all together.",
  pages: "Keep every word, image, and link on your website up to date.",
  service: "Your services, your prices, your way.",
  course: "Build learning experiences that open doors.",
  promotion: "Give your next special its moment to shine.",
  event: "Bring people together. Make every detail yours.",
  gallery: "Show the work. Tell the story behind it.",
  registrations: "Know who is coming, keep count, and stay organised.",
  bookings: "Turn a request into a beautifully managed appointment.",
  students: "Keep enrollment and tuition requests in one place.",
  testimonials: "Share kind words and answer the questions people ask.",
  payments: "Choose how your customers pay, with clear instructions.",
  settings: "The details that make this business yours.",
  history: "A record of your changes, and a way back when you need it.",
};
const helps = {
  dashboard: [
    "See live counts of published services, active courses, upcoming events, and requests awaiting a decision.",
    "Use the quick actions to create content. Drafts stay private; published items appear on your website.",
    "The checklist highlights useful next steps. Counts are drawn from your records.",
  ],
  pages: [
    "Choose Home, Salon, or Academy, then filter by section. Edit each text block, button destination, or image.",
    "The original layout stays consistent. You can hide entire sections in Business settings.",
    "Changes appear after saving and refreshing the website. Use the website button to review the result.",
  ],
  service: [
    "Add, change, or archive a service. Set its category, price in Jamaican dollars, duration, and description.",
    "Leave price blank for a consultation or variable price. The deposit settings are under Business settings.",
    "A draft is private. Published services appear in the catalog and booking form. Archived services can be restored from the Archived filter.",
  ],
  course: [
    "Create and edit course fees, kit-inclusive fees, categories, start descriptions, schedules, and learning options.",
    "Prices are in Jamaican dollars. The registration fee is set in Business settings.",
    "Published courses appear in the course catalog, enrollment form, and tuition form. Archive a course to stop new requests without losing student records.",
  ],
  promotion: [
    "Create a special as a pop-up, banner, top strip, floating card, or inline feature.",
    "Choose pages and schedule the start and end. All times shown here are Jamaica time. A pop-up appears once per browser session per saved version.",
    "A promotion advertises an offer. Update the service/course price separately if the offer changes what customers should pay. Discount codes here are display text, not automatic checkout discounts.",
  ],
  event: [
    "Set a date, location, fee, capacity, registration deadline, and whether a waitlist is allowed. A capacity of 0 means no limit.",
    "The form always asks for name, email, and phone. Add extra questions with the visual form builder; mark questions required and set choices.",
    "Form changes apply to future signups. Existing responses keep a copy of the questions they answered. View tally, check in attendees, and export responses from Event registrations.",
  ],
  gallery: [
    "Upload JPG, PNG, WebP, or AVIF images up to 10 MB, or use an image URL.",
    "Choose Salon or Academy for its gallery. Add a caption, accessible image description, and optional story. Stories also appear in their own website section.",
    "Confirm that you have permission before publishing client images. Archive a gallery item to remove it from public view.",
  ],
  registrations: [
    "Filter by event, status, or name. See confirmed, waitlisted, attended, and cancelled registrations separately.",
    "Open a record to see every answer, payment reference, and the original form. Add private notes and update attendance or payment status.",
    "Capacity is enforced when people register. A full event either rejects new signups or places them on the waitlist. If you cancel a place, manually confirm the next waitlisted person.",
    "Export includes the form questions and answers. Keep downloaded contact information private.",
  ],
  bookings: [
    "Review requested service, date, time, contact details, payment method, and customer notes.",
    "A request is not an automatic appointment. Confirm availability with the client, then set the status to Confirmed.",
    "Check the payment with your bank or payment provider before marking Paid. The website never treats a return URL or customer reference as proof.",
  ],
  students: [
    "Enrollment and tuition requests show the selected course, learning approach, schedule, kit choice, and customer notes.",
    "The amount on an enrollment request is the registration fee. Tuition records show the submitted payment amount; verify it with your provider.",
    "Use private notes and statuses to organise follow-up. This is a request and payment register, not a student balance ledger.",
  ],
  testimonials: [
    "Publish testimonials only when you have permission. Add the person’s name, quote, and relationship to your business.",
    "FAQs appear on the website as expandable questions and answers. Use them for preparation, location, policies, and common questions.",
  ],
  payments: [
    "Turn on the payment methods you want customers to use. Edit bank instructions and secure hosted payment links.",
    "WiPay can open its hosted checkout using your account number. Fygaro and NCB use the payment links you create with those providers. You must complete merchant approval with each provider.",
    "For fixed-price provider links, create a separate link for the correct item and amount, then paste it into that service, course, or event. A general link should support a customer-entered amount.",
    "Payments remain Pending until you verify them in your bank or provider dashboard and mark them Paid. No card details or secret API keys are stored here.",
  ],
  settings: [
    "Update business contact information, working hours, policies, registration fees, and booking deposit rules.",
    "Hide or show website sections with the visibility controls. Page-specific headings and links are edited under Website pages.",
    "The registered owner account controls this studio. Use Account password to set or change your password.",
  ],
  history: [
    "See earlier versions of website content and restore a previous version. Restoration creates another history entry.",
    "Export content and registrations as JSON for an offline copy, or export registration lists as CSV.",
    "Archived content remains available under each section’s Archived filter. Original imported content is preserved in the repository.",
  ],
};
const schema = {
  service: [
    ["category", "Category", "text", "Hair & beauty"],
    ["price", "Price (JMD)", "number"],
    ["price_from", "Show “From” before the price", "bool"],
    ["duration", "Duration", "text", "e.g. 1 hr"],
    ["description", "Description", "textarea"],
    ["featured", "Featured service", "bool"],
    ["wipay_link", "WiPay link for this item (optional)", "url"],
    ["fygaro_link", "Fygaro link for this item (optional)", "url"],
    ["ncb_link", "NCB link for this item (optional)", "url"],
    ["payment_url", "Other provider link for this item (optional)", "url"],
  ],
  course: [
    ["category", "Category", "text", "e.g. hair, nails, makeup"],
    ["price", "Course fee (JMD)", "number"],
    ["kit_price", "Total fee including kit (JMD, optional)", "number"],
    [
      "start",
      "Start date / intake description",
      "text",
      "e.g. January 2027 intake",
    ],
    ["schedule", "Class days and times", "text", "e.g. Mondays, 9am–1pm"],
    ["description", "What students will learn", "textarea"],
    ["flexible", "Allow online or face-to-face selection", "bool"],
    ["wipay_link", "WiPay link for this item (optional)", "url"],
    ["fygaro_link", "Fygaro link for this item (optional)", "url"],
    ["ncb_link", "NCB link for this item (optional)", "url"],
    ["payment_url", "Other provider link for this item (optional)", "url"],
  ],
  promotion: [
    ["badge", "Small label", "text", "SPECIAL OFFER"],
    ["description", "Offer details", "textarea"],
    [
      "display",
      "How should it appear?",
      "select",
      ["popup", "banner", "strip", "floating", "card"],
    ],
    ["image", "Offer image (optional)", "image"],
    ["button", "Button text", "text", "Explore this offer"],
    ["url", "Where should the button go?", "url", "e.g. /salon.html#book"],
    ["code", "Display offer code (optional)", "text"],
    ["starts_at", "Start showing (Jamaica time)", "datetime-local"],
    ["ends_at", "Stop showing (Jamaica time)", "datetime-local"],
    ["pages", "Show on these pages", "pages"],
  ],
  event: [
    ["description", "About the event", "textarea"],
    ["image", "Event image", "image"],
    ["starts_at", "Event date & time (Jamaica)", "datetime-local"],
    ["location", "Venue / online location", "text"],
    ["price", "Entry fee (JMD; 0 for free)", "number"],
    ["capacity", "Maximum places (0 means unlimited)", "number"],
    [
      "registration_deadline",
      "Registration closes (Jamaica time)",
      "datetime-local",
    ],
    ["registration_open", "Accept registrations", "bool"],
    ["waitlist", "Allow a waitlist when full", "bool"],
    ["form_intro", "Introduction above the registration form", "textarea"],
    ["wipay_link", "WiPay link for this item (optional)", "url"],
    ["fygaro_link", "Fygaro link for this item (optional)", "url"],
    ["ncb_link", "NCB link for this item (optional)", "url"],
    ["payment_url", "Other provider link for this item (optional)", "url"],
  ],
  gallery: [
    ["image", "Image", "image"],
    ["alt", "Describe the image for accessibility", "text"],
    ["category", "Collection", "select", ["salon", "academy"]],
    ["tag", "Short caption / category", "text"],
    ["story", "The story behind the work", "textarea"],
    ["consent", "I have permission to publish this image and story", "bool"],
  ],
  testimonial: [
    ["quote", "Client or student quote", "textarea"],
    ["role", "Client / student description", "text"],
    ["consent", "I have permission to share this testimonial", "bool"],
  ],
  faq: [["answer", "Answer", "textarea"]],
};
function all(kind, archived = false) {
  return content.filter(
    (r) =>
      r.kind === kind &&
      (archived ? r.status === "archived" : r.status !== "archived"),
  );
}
function config() {
  return content.find((r) => r.id === "site-settings")?.data || {};
}
function badge(v) {
  return `<span class="badge ${esc(v)}">${esc(v)}</span>`;
}
function action(label, id, cls = "") {
  return `<button class="button ${cls}" data-action="${id}">${label}</button>`;
}
function top(title, button = "") {
  return `<div class="heading"><div><span class="eyebrow">YOUR BEAUTY PLUS STUDIO</span><div class="heading-title"><h1>${esc(title)}</h1><button class="icon-button" data-help="${active}" aria-label="What can I do on this page?">i</button></div><p>${esc(descriptions[active])}</p></div>${button}</div>`;
}
function empty(title, text, button = "") {
  return `<div class="empty">${icon(active === "event" ? "calendar" : "spark")}<h3>${esc(title)}</h3><p>${esc(text)}</p>${button}</div>`;
}
async function load() {
  [content, submissions] = await Promise.all([
    fetchAll("bp_content", "sort_order", true),
    fetchAll("bp_submissions", "created_at", false),
  ]);
}
async function fetchAll(table, key, ascending) {
  let out = [],
    from = 0;
  while (true) {
    const chunk = await checked(
      db
        .from(table)
        .select("*")
        .order(key, { ascending })
        .order("id", { ascending: true })
        .range(from, from + 999),
    );
    out.push(...chunk);
    if (chunk.length < 1000) return out;
    from += 1000;
  }
}
function shell() {
  const title = sections.find((x) => x[0] === active)?.[1] || "Overview";
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">b<span>+</span></span><div><strong>Beauty Plus</strong><small>The owner studio</small></div></a><nav>${sections.map(([id, name, ic, group]) => `${group ? `<div class="nav-group">${group}</div>` : ""}<button class="nav-button ${active === id ? "active" : ""}" data-nav="${id}">${icon(ic)}${name}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="profile"><span class="avatar">P</span><div><strong>Studio owner</strong><br><small>${esc(user.email)}</small></div></div><button class="button small" data-action="logout">${icon("logout")} Sign out</button></div></aside><main class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="button mobile-toggle" data-action="menu" aria-label="Open navigation">${icon("menu")}</button><span class="breadcrumb">Owner studio <b>/ ${esc(title)}</b></span></div><div class="topbar-actions"><span class="live-dot">Connected to your website</span><a class="button" href="/" target="_blank" rel="noopener">View website ↗</a></div></header><div class="content" id="content"></div></main></div>`;
  render();
}
function dashboard() {
  const events = all("event").filter(
      (r) =>
        r.status === "published" && Date.parse(r.data.starts_at) > Date.now(),
    ),
    pending = submissions.filter((r) => r.status === "new"),
    stats = [
      [
        all("service").filter((r) => r.status === "published").length,
        "Published services",
        "Your live service menu",
        "spark",
      ],
      [
        all("course").filter((r) => r.status === "published").length,
        "Active courses",
        "Ready for new students",
        "book",
      ],
      [pending.length, "New requests", "Waiting for your attention", "users"],
      [
        events.length,
        "Upcoming events",
        "Connections in the making",
        "calendar",
      ],
    ];
  const payments = config().payments || [];
  return (
    top("A beautiful day to grow.") +
    `<section class="intro-card"><div><div class="eyebrow">WELCOME TO YOUR SPACE</div><h2>A little less admin.<br>A lot more possibility.</h2><p>From your next special to your next student, you’re in control. Let’s make something beautiful happen.</p></div><div><button class="button gold" data-new="promotion">${icon("plus")} Create a special</button></div></section><div class="stats">${stats.map(([n, l, note, ic]) => `<div class="stat"><div class="stat-top">${l}${icon(ic)}</div><div class="stat-value">${n}</div><small>${note}</small></div>`).join("")}</div><div class="dashboard-columns"><div><section class="panel"><div class="panel-header"><h3>What would you like to do?</h3><span class="eyebrow">QUICK ACTIONS</span></div><div class="quick-grid">${[
      ["service", "spark", "Add a service", "Keep your menu fresh"],
      ["course", "book", "Create a course", "Share your expertise"],
      ["event", "calendar", "Plan an event", "Bring people together"],
      ["gallery", "image", "Share your work", "Let the results speak"],
      ["promotion", "tag", "Create a special", "Make it a moment"],
      ["faq", "mail", "Answer a question", "Give clients clarity"],
    ]
      .map(
        ([k, i, t, n]) =>
          `<button class="quick-action" data-new="${k}">${icon(i)}<strong>${t}</strong><small>${n}</small></button>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><div class="panel-header"><h3>Your latest requests</h3><button class="button small" data-nav="registrations">View registrations →</button></div>${
      submissions.length
        ? `<table><tbody>${submissions
            .slice(0, 5)
            .map(
              (s) =>
                `<tr><td>${esc(s.name)}<small>${esc(s.data.item || s.kind)}</small></td><td>${badge(s.status)}</td><td><button class="button small" data-request="${s.id}">Open</button></td></tr>`,
            )
            .join("")}</tbody></table>`
        : empty(
            "The next chapter starts here.",
            "New booking requests, enrollments, and event signups will appear here as they arrive.",
          )
    }</section></div><div><section class="panel"><div class="panel-header"><h3>Your studio checklist</h3>${icon("check")}</div>${[
      [
        true,
        "Services imported",
        "Your existing catalog is ready to manage.",
        "service",
      ],
      [
        payments.some(
          (p) =>
            p.enabled && (p.url || p.account_number || p.provider === "bank"),
        ),
        "Check your payment options",
        "Confirm bank details and gateway links.",
        "payments",
      ],
      [
        all("event").length > 0,
        "Create your first event",
        "Add a workshop or community experience.",
        "event",
      ],
      [
        all("gallery").some((r) => r.data.story),
        "Tell the story behind your work",
        "Give your images a personal touch.",
        "gallery",
      ],
    ]
      .map(
        ([done, t, n, v]) =>
          `<div class="check-row"><span class="dot">${done ? "✓" : "○"}</span><div>${t}<small>${n}</small></div><button class="button small" data-nav="${v}">→</button></div>`,
      )
      .join(
        "",
      )}</section><section class="guide"><span class="eyebrow">A HELPING HAND, ALWAYS</span><h2 style="font-size:25px;margin-top:16px">You don’t have to<br>figure it out alone.</h2><p>Look for the <b>i</b> button on every page. It explains what that space is for and how to use it.</p><button class="button small" style="margin-top:18px" data-help="dashboard">Take a quick look →</button></section></div></div><p class="footer-note">BUILT FOR BEAUTY PLUS • SPACE TO CREATE, CONFIDENCE TO GROW</p>`
  );
}
function listContent(kind) {
  const cards = [
    "gallery",
    "promotion",
    "event",
    "testimonial",
    "faq",
  ].includes(kind);
  let list = all(kind, viewFilter === "archived")
    .filter((r) => (viewFilter === "draft" ? r.status === "draft" : true))
    .filter((r) =>
      JSON.stringify([r.title, r.data])
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const title =
    sections.find((x) => x[0] === kind)?.[1] ||
    { testimonial: "Testimonials", faq: "Frequently asked questions" }[kind];
  const filters = `<div class="toolbar"><input class="search" id="search" type="search" placeholder="Search ${esc(title.toLowerCase())}…" value="${esc(search)}" aria-label="Search items"><select id="viewFilter" aria-label="Filter items"><option value="active" ${viewFilter === "active" ? "selected" : ""}>All current items</option><option value="draft" ${viewFilter === "draft" ? "selected" : ""}>Drafts</option><option value="archived" ${viewFilter === "archived" ? "selected" : ""}>Archived</option></select><small>${list.length} items</small></div>`;
  const editButton = (r) =>
    `<button class="button small" data-edit="${r.id}">Edit ${icon("arrow")}</button>`;
  return (
    top(
      title,
      `<button class="button primary" data-new="${kind}">${icon("plus")} Add ${kind === "gallery" ? "image & story" : kind}</button>`,
    ) +
    filters +
    (!list.length
      ? empty(
          "Make room for something beautiful.",
          viewFilter === "archived"
            ? "No archived items here."
            : "Add your first item. You can save a draft while you get it ready.",
        )
      : cards
        ? `<div class="content-grid">${list.map((r) => `<article class="item-card">${r.kind === "promotion" ? `<div class="promo-preview"><small>${esc(r.data.display || "banner")} • ${esc(r.data.badge || "SPECIAL OFFER")}</small><strong>${esc(r.title)}</strong><p>${esc(r.data.description || "Your next special starts here.")}</p></div>` : r.data.image ? `<img src="${esc(safeURL(r.data.image, true))}" alt="${esc(r.data.alt || r.title)}">` : ""}<div class="item-card-body">${r.kind === "promotion" ? "" : `<h3>${esc(r.title)}</h3>`}<p>${esc((r.data.story || r.data.description || r.data.quote || r.data.answer || r.data.tag || "").slice(0, 180))}</p>${r.kind === "event" ? `<p>${esc(date(r.data.starts_at))}<br>${esc(r.data.location)}</p><div class="notice">${submissions.filter((s) => s.content_id === r.id && !["cancelled", "waitlisted"].includes(s.status)).length} / ${r.data.capacity || "∞"} places · ${submissions.filter((s) => s.content_id === r.id && s.status === "waitlisted").length} waitlisted</div><button class="button small" data-event-requests="${r.id}">View registrations & export →</button>` : ""}<div class="item-card-footer">${badge(r.status)}${editButton(r)}</div></div></article>`).join("")}</div>`
        : `<div class="table-wrap"><table><thead><tr><th>${kind === "course" ? "Course" : "Service"}</th><th>Category</th><th>Fee</th><th>Visibility</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td><strong>${esc(r.title)}</strong><small>${esc(kind === "course" ? r.data.schedule : r.data.duration)}</small></td><td>${esc(r.data.category)}</td><td>${r.data.price == null ? "Consultation" : money(r.data.price)}${r.data.kit_price ? `<small>With kit: ${money(r.data.kit_price)}</small>` : ""}</td><td>${badge(r.status)}</td><td class="actions">${editButton(r)}</td></tr>`).join("")}</tbody></table></div>`)
  );
}
function pages() {
  const list = all("page").filter(
    (r) =>
      r.data.page === pageFilter &&
      (!sectionFilter || r.data.section === sectionFilter) &&
      [r.title, r.data.value]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const sectionsList = [
    ...new Set(
      all("page")
        .filter((r) => r.data.page === pageFilter)
        .map((r) => r.data.section),
    ),
  ];
  return (
    top(
      "Your website, in your words.",
      `<a class="button" target="_blank" href="/${pageFilter}.html">Preview page ↗</a>`,
    ) +
    `<div class="tabs">${[
      ["index", "Home"],
      ["salon", "Salon"],
      ["enroll", "Academy"],
    ]
      .map(
        ([id, t]) =>
          `<button class="${pageFilter === id ? "active" : ""}" data-page="${id}">${t}</button>`,
      )
      .join(
        "",
      )}</div><div class="notice">Edit text, images, and button destinations below. Save to update the website. Section visibility is in Business settings.</div><div class="toolbar"><input class="search" id="search" value="${esc(search)}" placeholder="Find a heading, paragraph, image, or link…" aria-label="Search page content"><select id="sectionFilter" aria-label="Filter by section"><option value="">All sections</option>${sectionsList.map((s) => `<option ${s === sectionFilter ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Section</th><th>Content</th><th>Type</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td>${esc(r.data.section)}</td><td class="page-copy">${r.data.type === "image" ? `<div class="row-name"><img class="image-thumb" src="${esc(safeURL(r.data.value, true))}" alt="">${esc(r.title)}</div>` : esc(r.data.value).slice(0, 220)}</td><td>${badge(r.data.type)}</td><td class="actions"><button class="button small" data-edit="${r.id}">Edit →</button></td></tr>`).join("")}</tbody></table></div>`
  );
}
function requests() {
  const kinds =
    active === "registrations"
      ? ["event"]
      : active === "bookings"
        ? ["booking"]
        : ["enrollment", "tuition"];
  const list = submissions.filter(
    (s) =>
      kinds.includes(s.kind) &&
      (!requestEvent || s.content_id === requestEvent) &&
      (!requestStatus || s.status === requestStatus) &&
      JSON.stringify([s.name, s.email, s.phone, s.data.item, s.id])
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const count = (status) => list.filter((s) => s.status === status).length;
  return (
    top(
      sections.find((x) => x[0] === active)[1],
      action(icon("download") + " Export CSV", "export-csv"),
    ) +
    `<div class="stats">${[
      [list.length, "Total records"],
      [count("new"), "Awaiting review"],
      [count("confirmed") + count("attended"), "Confirmed / attended"],
      [count("waitlisted"), "Waitlisted"],
    ]
      .map(
        ([n, l]) =>
          `<div class="stat"><div class="stat-top">${l}</div><div class="stat-value">${n}</div></div>`,
      )
      .join(
        "",
      )}</div><div class="toolbar"><input id="search" class="search" value="${esc(search)}" placeholder="Search name, email, phone, or reference…" aria-label="Search registrations">${
      active === "registrations"
        ? `<select id="requestEvent" aria-label="Select event"><option value="">All events</option>${content
            .filter((r) => r.kind === "event")
            .map(
              (r) =>
                `<option value="${r.id}" ${requestEvent === r.id ? "selected" : ""}>${esc(r.title)}</option>`,
            )
            .join("")}</select>`
        : ""
    }<select id="requestStatus" aria-label="Filter status"><option value="">All statuses</option>${["new", "confirmed", "waitlisted", "attended", "completed", "cancelled"].map((s) => `<option ${requestStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="table-wrap">${list.length ? `<table><thead><tr><th>Person</th><th>${active === "registrations" ? "Event" : "Request"}</th><th>Status</th><th>Payment</th><th>Received</th><th></th></tr></thead><tbody>${list.map((s) => `<tr><td><strong>${esc(s.name)}</strong><small>${esc(s.email)}</small></td><td>${esc(s.data.item || s.kind)}<small>${esc(s.kind)}</small></td><td>${badge(s.status)}</td><td>${money(s.amount)}<small>${badge(s.payment_status)} · ${esc(s.payment_method || "Free")}</small></td><td><small>${date(s.created_at)}</small></td><td class="actions"><button class="button small" data-request="${s.id}">View →</button></td></tr>`).join("")}</tbody></table>` : empty("Your community is growing.", "Requests will appear here when someone submits a form on your website.")}</div>`
  );
}
const providers = {
  wipay: {
    name: "WiPay Jamaica",
    initial: "W",
    intro: "Accept debit and credit cards on WiPay’s secure hosted page.",
    steps: [
      "Create or sign in to a WiPay Jamaica Business account and complete merchant verification.",
      "Copy your WiPay account number into this card. Save and enable it. The website requests a hosted checkout after a customer saves a request.",
      "Alternatively, create a payment link and paste its HTTPS URL below. Set who pays the transaction fee with WiPay.",
      "Check payments in WiPay using the request reference before marking a record Paid.",
    ],
    url: "https://wipaycaribbean.com/solutions",
  },
  bank: {
    name: "Bank transfer",
    initial: "B",
    intro:
      "Accept transfers into your business account with clear customer instructions.",
    steps: [
      "Confirm your bank, account name, account number, account type, branch, and currency.",
      "Put those details in Customer instructions below. Tell clients to include their request reference.",
      "Turn on this method and save. Verify incoming funds in your bank before marking Paid.",
    ],
    url: "",
  },
  fygaro: {
    name: "Fygaro",
    initial: "F",
    intro:
      "Use a secure Fygaro Link for cards and provider-supported payment options.",
    steps: [
      "Open a Fygaro merchant account through the provider or a participating Jamaican bank; complete approval.",
      "In Fygaro, open Fygaro Links and choose Create. Use a variable-amount link for general requests, or an item-specific fixed amount.",
      "Copy the shareable HTTPS link into Payment link below, or into the matching service, course, or event for a fixed amount.",
      "Confirm currency and amount in Fygaro. Update fixed-price links when prices change. Verify payment in Fygaro before marking Paid.",
    ],
    url: "https://help.fygaro.com/en-us/article/fygaro-links-payment-buttons-tck05y/",
  },
  ncb: {
    name: "NCB Payment Buttons",
    initial: "N",
    intro: "A Jamaica bank option powered by Fygaro, with merchant approval.",
    steps: [
      "Contact NCB Merchant Services about Payment Links / Payment Buttons. Complete the account and merchant requirements.",
      "After approval, create the payment link in your provider dashboard. Check currency and the amount type.",
      "Paste a variable-amount link here or a fixed-price link into the matching item. Enable and save.",
      "Check your provider’s payment record before marking a request Paid. Ask NCB for current fees.",
    ],
    url: "https://www.jncb.com/business/accept-payments/",
  },
  cash: {
    name: "Pay at the salon",
    initial: "C",
    intro: "Let customers arrange in-person payment with your team.",
    steps: [
      "Write when and where customers should pay and whether a deposit is needed to hold their place.",
      "Enable this option, then save. The request is recorded as payment pending.",
      "Mark Paid only after the team receives the payment.",
    ],
    url: "",
  },
};
function payments() {
  return (
    top(
      "Make getting paid feel simple.",
      action("Save payment methods", "save-payments", "primary"),
    ) +
    `<div class="notice">Only enable methods your business is ready to accept. Provider account approval and fees are handled by each provider. Customer card details stay on the provider’s hosted page. Payments are verified manually in this studio.</div><form id="payments-form">${(
      config().payments || []
    )
      .map((p, i) => {
        const guide = providers[p.provider] || providers.bank;
        return `<section class="panel payment-card" data-payment-index="${i}"><div class="panel-header"><div class="payment-heading"><span class="payment-logo">${guide.initial}</span><div><h3>${guide.name}</h3><small>${guide.intro}</small></div></div><label class="field check"><input name="enabled" type="checkbox" ${p.enabled ? "checked" : ""}>Enabled</label></div><div class="form-grid"><label class="field">Label customers see<input name="label" value="${esc(p.label)}" required maxlength="100"></label><label class="field">Payment link (HTTPS, optional)<input name="url" type="url" placeholder="https://…" value="${esc(p.url)}"></label>${p.provider === "wipay" ? `<label class="field">WiPay Jamaica account number<input name="account_number" value="${esc(p.account_number || "")}" inputmode="numeric"></label><label class="field">Transaction fees<select name="fee_structure"><option value="customer_pay" ${p.fee_structure === "customer_pay" ? "selected" : ""}>Customer pays provider fee</option><option value="merchant_absorb" ${p.fee_structure === "merchant_absorb" ? "selected" : ""}>Business absorbs provider fee</option></select></label>` : ""}<label class="field full">Customer instructions<textarea name="instructions" placeholder="Explain the steps, bank details, and payment reference to use.">${esc(p.instructions)}</textarea></label></div><details class="guide" style="margin-top:20px"><summary>How to set up ${guide.name}</summary><ol>${guide.steps.map((s) => `<li>${s}</li>`).join("")}</ol>${guide.url ? `<a href="${guide.url}" target="_blank" rel="noopener">Official setup information ↗</a>` : ""}</details></section>`;
      })
      .join(
        "",
      )}</form><section class="guide"><h3>Have a different bank or gateway?</h3><p>Ask your bank for its secure hosted payment link. The option below supports a link from an approved provider without collecting card details on your website. A direct API integration with automatic verification needs provider credentials and additional work.</p><button class="button" data-action="add-payment">${icon("plus")} Add another payment link</button></section>`
  );
}
const settingFields = [
  ["name", "Business name"],
  ["email", "Business email", "email"],
  ["phone", "Phone number"],
  ["whatsapp", "WhatsApp number (country code, digits only)"],
  ["address", "Business address"],
  ["hours", "Opening hours"],
  ["registration_fee", "Registration fee (JMD)", "number"],
  ["deposit_percent", "Booking deposit (%)", "number"],
  ["variable_deposit", "Deposit for variable-price services (JMD)", "number"],
  ["cancellation_policy", "Cancellation / refund policy", "textarea"],
  ["privacy_policy", "Privacy information", "textarea"],
  ["index_title", "Homepage search title"],
  ["index_description", "Homepage search description", "textarea"],
  ["salon_title", "Salon search title"],
  ["salon_description", "Salon search description", "textarea"],
  ["enroll_title", "Academy search title"],
  ["enroll_description", "Academy search description", "textarea"],
];
function fieldHTML([key, label, type = "text", options], d = {}) {
  const value = d[key] ?? "";
  const input =
    type === "textarea"
      ? `<textarea name="${key}" maxlength="15000">${esc(value)}</textarea>`
      : type === "select"
        ? `<select name="${key}">${options.map((o) => `<option value="${esc(o)}" ${value === o ? "selected" : ""}>${esc(key === "display" ? { popup: "Pop-up window", banner: "Bottom banner", strip: "Top announcement strip", floating: "Floating offer card", card: "Feature card in page" }[o] || o : o)}</option>`).join("")}</select>`
        : type === "bool"
          ? `<input type="checkbox" name="${key}" ${value ? "checked" : ""}>`
          : type === "pages"
            ? `<div style="margin-top:12px">${["index.html", "salon.html", "enroll.html", "events.html"].map((p) => `<label class="field check"><input type="checkbox" name="pages" value="${p}" ${!value.length || value.includes(p) ? "checked" : ""}>${p}</label>`).join("")}</div>`
            : type === "image"
              ? `<input name="${key}" value="${esc(value)}" placeholder="Paste an image URL or upload below"><input class="image-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-upload="${key}"><small>JPG, PNG, WebP or AVIF • up to 10 MB</small>${value ? `<img src="${esc(safeURL(value, true))}" alt="Image preview">` : ""}`
              : `<input type="${type === "url" ? "text" : type}" name="${key}" value="${esc(type === "datetime-local" && value ? jamaicaInput(value) : value)}" ${type === "number" ? 'min="0" step="0.01"' : ""} maxlength="10000" placeholder="${esc(typeof options === "string" ? options : "")}">`;
  return `<label class="field ${["textarea", "image", "pages"].includes(type) ? "full" : ""} ${type === "bool" ? "check" : ""} ${type === "image" ? "image-field" : ""}">${type === "bool" ? input + esc(label) : esc(label) + input}${key === "kit_price" ? '<div class="label-note">Enter the full price with the kit, not just the kit add-on.</div>' : ""}</label>`;
}
function jamaicaInput(v) {
  return new Date(new Date(v).getTime() - 5 * 3600000)
    .toISOString()
    .slice(0, 16);
}
function settingsPage() {
  const d = config(),
    hide = d.hidden_sections || [],
    visibility = [
      ["home", "Homepage hero"],
      ["about", "About the business"],
      ["salon", "Homepage salon introduction"],
      ["academy", "Homepage academy introduction"],
      ["gallery", "Salon gallery"],
      ["school-gallery", "Academy gallery"],
      ["services", "Salon price catalog"],
      ["book", "Salon booking form"],
      ["courses", "Academy course catalog"],
      ["register", "Enrollment form"],
      ["pay-tuition", "Tuition form"],
      ["bp-events", "Events"],
      ["bp-stories", "Image stories"],
      ["bp-reviews", "Testimonials"],
      ["bp-faq", "FAQs"],
    ];
  return (
    top(
      "The details behind the beauty.",
      action("Save business settings", "save-settings", "primary"),
    ) +
    `<form id="settings-form"><section class="panel"><div class="panel-header"><h3>Your business details</h3><button type="button" class="icon-button" data-help="settings" aria-label="Help with settings">i</button></div><div class="form-grid">${settingFields.map((f) => fieldHTML(f, d)).join("")}</div></section><section class="panel"><div class="panel-header"><h3>Show or hide website sections</h3></div><p>Turn a section off while you prepare it. The content stays saved.</p>${visibility.map(([id, t]) => `<label class="switch-row"><div><strong>${t}</strong></div><input type="checkbox" name="visible" value="${id}" ${!hide.includes(id) ? "checked" : ""}></label>`).join("")}</section></form><section class="panel"><h3>Your owner account</h3><p>${esc(user.email)}</p><button class="button" data-action="password">Set or change account password</button></section>`
  );
}
function historyPage() {
  return (
    top(
      "A little peace of mind.",
      action(icon("download") + " Export backup", "backup", "primary"),
    ) +
    `<div class="notice">Changes to your website content are recorded automatically. Restore an earlier version below, or export a private copy of your content and registrations.</div><section class="panel" id="history-list"><p>Loading recent changes…</p></section>`
  );
}
function render() {
  const target = $("#content");
  if (!target) return;
  target.innerHTML =
    active === "dashboard"
      ? dashboard()
      : active === "pages"
        ? pages()
        : ["service", "course", "promotion", "event", "gallery"].includes(
              active,
            )
          ? listContent(active)
          : ["registrations", "bookings", "students"].includes(active)
            ? requests()
            : active === "payments"
              ? payments()
              : active === "settings"
                ? settingsPage()
                : active === "history"
                  ? historyPage()
                  : active === "testimonials"
                    ? `<div class="tabs"><button data-collection="testimonial" class="${collection === "testimonial" ? "active" : ""}">Testimonials</button><button data-collection="faq" class="${collection === "faq" ? "active" : ""}">FAQs</button></div>` +
                      listContent(collection)
                    : dashboard();
  if (active === "history") loadHistory();
  $("#search")?.addEventListener("input", (e) => {
    search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(pos, pos);
  });
  for (const id of [
    "viewFilter",
    "sectionFilter",
    "requestEvent",
    "requestStatus",
  ])
    $("#" + id)?.addEventListener("change", (e) => {
      if (id === "viewFilter") viewFilter = e.target.value;
      if (id === "sectionFilter") sectionFilter = e.target.value;
      if (id === "requestEvent") requestEvent = e.target.value;
      if (id === "requestStatus") requestStatus = e.target.value;
      render();
    });
}
let collection = "testimonial";
function showHelp(key) {
  const modal = $("#help");
  modal.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">YOUR STUDIO GUIDE</span><h2>${esc(sections.find((x) => x[0] === key)?.[1] || "How this works")}</h2></div><button class="dialog-close" data-close>×</button></div><div class="dialog-body"><ol class="help-list">${(helps[key] || helps.settings).map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div><div class="dialog-footer"><span></span><button class="button primary" data-close>Got it</button></div>`;
  modal.showModal();
}
function readFields(form, defs, base = {}) {
  const data = { ...base };
  for (const [key, , type = "text"] of defs) {
    const el = form.elements[key];
    if (type === "bool") data[key] = el.checked;
    else if (type === "number")
      data[key] = el.value === "" ? null : Number(el.value);
    else if (type === "datetime-local")
      data[key] = el.value
        ? new Date(el.value + ":00-05:00").toISOString()
        : "";
    else if (type === "pages")
      data[key] = [...form.querySelectorAll("[name=pages]:checked")].map(
        (el) => el.value,
      );
    else data[key] = el.value.trim();
  }
  return data;
}
function formBuilder(fields) {
  return `<div class="form-builder"><div class="panel-header"><div><h3>Build your registration form</h3><p style="font-size:11px">Name, email, and phone are always included. Add your own questions below.</p></div><button type="button" class="icon-button" data-help="event" aria-label="Help with registration form">i</button></div><div id="builder-fields">${fields.map((f, i) => builderField(f, i)).join("")}</div><button type="button" class="button" data-action="add-question" style="margin-top:18px">${icon("plus")} Add a question</button><button type="button" class="button" data-action="preview-form" style="margin-top:18px">Preview form</button></div>`;
}
function builderField(f, i) {
  return `<div class="builder-field" data-field-id="${esc(f.id)}"><div class="builder-actions"><strong>QUESTION ${i + 1}</strong><div class="builder-tools"><button class="button small" type="button" data-field-up aria-label="Move question up">↑</button><button class="button small" type="button" data-field-down aria-label="Move question down">↓</button><button class="button small danger" type="button" data-field-remove>Remove</button></div></div><div class="form-grid"><label class="field">Question<input name="question_label" value="${esc(f.label)}" required maxlength="200"></label><label class="field">Answer type<select name="question_type">${["text", "textarea", "email", "tel", "number", "date", "select", "checkbox"].map((t) => `<option ${f.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></label><label class="field full">Choices (one per line, for a select question)<textarea name="question_options" rows="2">${esc((f.options || []).join("\n"))}</textarea></label><label class="field check"><input name="question_required" type="checkbox" ${f.required ? "checked" : ""}>Required answer</label></div></div>`;
}
function readBuilder() {
  return [...editor.querySelectorAll(".builder-field")].map((el) => ({
    id: el.dataset.fieldId,
    label: el.querySelector("[name=question_label]").value.trim(),
    type: el.querySelector("[name=question_type]").value,
    options: el
      .querySelector("[name=question_options]")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    required: el.querySelector("[name=question_required]").checked,
  }));
}
function edit(rowOrKind) {
  const existing = typeof rowOrKind === "object",
    row = existing
      ? rowOrKind
      : {
          id: crypto.randomUUID(),
          kind: rowOrKind,
          title: "",
          status: "draft",
          sort_order: content.length,
          data: {
            registration_open: true,
            waitlist: true,
            price: rowOrKind === "service" ? null : 0,
            capacity: 0,
            display: "banner",
            category: rowOrKind === "gallery" ? "salon" : "",
            fields: [],
          },
        },
    kind = row.kind;
  let defs = schema[kind] || [];
  if (kind === "page")
    defs =
      row.data.type === "image"
        ? [
            ["value", "Image", "image"],
            ["alt", "Image description", "text"],
          ]
        : [
            [
              "value",
              row.data.type === "text" ? "Website text" : "Link destination",
              row.data.type === "text" ? "textarea" : "url",
            ],
          ];
  editor.innerHTML = `<form id="edit-form"><div class="dialog-header"><div><span class="eyebrow">${kind === "page" ? "WEBSITE CONTENT" : existing ? "MAKE IT YOURS" : "CREATE SOMETHING BEAUTIFUL"}</span><h2>${kind === "page" ? "Edit " + row.data.type : existing ? "Edit " + kind : "New " + kind}</h2><p>${kind === "page" ? esc(row.data.page + " → " + row.data.section) : "Save a draft or publish when you’re ready."}</p></div><button type="button" class="dialog-close" data-close>×</button></div><div class="dialog-body"><div class="form-grid">${kind === "page" ? "" : `<label class="field full">${kind === "testimonial" ? "Person’s name" : kind === "faq" ? "Question" : "Title / name"}<input name="title" value="${esc(row.title)}" required maxlength="500"></label>`}${defs.map((f) => fieldHTML(f, row.data)).join("")}${kind === "page" ? "" : `<label class="field">Visibility<select name="status"><option value="draft" ${row.status === "draft" ? "selected" : ""}>Draft — private</option><option value="published" ${row.status === "published" ? "selected" : ""}>Published — on the website</option><option value="archived" ${row.status === "archived" ? "selected" : ""}>Archived — hidden</option></select></label><label class="field">Display order<input name="sort_order" type="number" step="1" value="${row.sort_order}"><div class="label-note">Smaller numbers appear first.</div></label>`}</div>${kind === "event" ? `<div style="margin-top:26px">${formBuilder(row.data.fields || [])}</div>` : ""}${kind === "promotion" ? '<div class="notice">An offer display does not automatically discount prices. Update the matching service or course fee when needed. Pop-ups appear once per session per version. Schedules use Jamaica time.</div><div class="promo-preview" id="live-promo-preview"></div>' : ""}</div><div class="dialog-footer"><div>${existing && kind !== "page" ? `<button class="button danger" type="button" data-archive="${row.id}">${row.status === "archived" ? "Restore as draft" : "Archive item"}</button>` : ""}</div><div><button type="button" class="button" data-close>Cancel</button> <button class="button primary" type="submit">Save ${kind === "page" ? "changes" : kind}</button></div></div></form>`;
  const form = $("#edit-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = readFields(form, defs, row.data),
      title =
        kind === "page"
          ? String(d.value).slice(0, 100) || row.title
          : form.elements.title.value.trim(),
      status = kind === "page" ? "published" : form.elements.status.value;
    try {
      validateContent(kind, d, status);
      if (kind === "event") {
        d.fields = readBuilder();
        if (
          d.fields.some(
            (f) => !f.label || (f.type === "select" && !f.options.length),
          )
        )
          throw new Error(
            "Give every question a label and every select question at least one choice.",
          );
      }
      await saveContent(
        {
          ...row,
          title,
          status,
          sort_order:
            kind === "page"
              ? row.sort_order
              : Number(form.elements.sort_order.value),
          data: d,
        },
        existing,
      );
      editor.close();
      toast(
        status === "published"
          ? "Saved. Your website is updated."
          : "Saved " + status + ".",
      );
      await load();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  };
  if (kind === "promotion") {
    const update = () => {
      $("#live-promo-preview").innerHTML =
        `<small>${esc(form.elements.badge.value || "SPECIAL OFFER")} • ${esc(form.elements.display.value)}</small><strong>${esc(form.elements.title.value || "Your special, beautifully presented.")}</strong><p>${esc(form.elements.description.value)}</p>`;
    };
    form.addEventListener("input", update);
    update();
  }
  editor.showModal();
}
function validateContent(kind, d, status) {
  for (const [k, v] of Object.entries(d)) {
    if (
      (k === "url" ||
        k === "payment_url" ||
        k.endsWith("_link") ||
        k === "image") &&
      v &&
      !safeURL(v, k === "image")
    )
      throw new Error("Please enter a safe website or image link.");
  }
  if (
    kind === "promotion" &&
    d.starts_at &&
    d.ends_at &&
    Date.parse(d.ends_at) <= Date.parse(d.starts_at)
  )
    throw new Error("The promotion end must be after its start.");
  if (kind === "event") {
    if (status === "published" && (!d.starts_at || !d.location))
      throw new Error("Add an event date and location before publishing.");
    if (d.capacity != null && !Number.isInteger(d.capacity))
      throw new Error("Capacity must be a whole number.");
    if (
      d.registration_deadline &&
      d.starts_at &&
      Date.parse(d.registration_deadline) > Date.parse(d.starts_at)
    )
      throw new Error("Registration must close before the event begins.");
  }
  if (["course", "event"].includes(kind) && (d.price == null || d.price < 0))
    throw new Error("Enter a price, or 0 for free.");
  if (
    ["gallery", "testimonial"].includes(kind) &&
    status === "published" &&
    !d.consent
  )
    throw new Error("Please confirm permission before publishing.");
  if (kind === "gallery" && status === "published" && !d.image)
    throw new Error("Choose an image before publishing.");
}
async function saveContent(row, existing = true) {
  const payload = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    sort_order: row.sort_order,
    data: row.data,
  };
  if (existing) {
    const saved = await checked(
      db
        .from("bp_content")
        .update(payload)
        .eq("id", row.id)
        .eq("version", row.version)
        .select(),
    );
    if (!saved.length)
      throw new Error(
        "This item changed in another session. Close this editor and refresh before saving.",
      );
  } else await checked(db.from("bp_content").insert(payload));
}
async function saveConfig(data) {
  const row = content.find((r) => r.id === "site-settings");
  await saveContent({ ...row, data });
  await load();
  toast("Saved. Your website is updated.");
  render();
}
async function savePayments() {
  const next = (config().payments || []).map((p, i) => {
    const el = document.querySelector(`[data-payment-index="${i}"]`);
    return {
      ...p,
      enabled: el.querySelector("[name=enabled]").checked,
      label: el.querySelector("[name=label]").value.trim(),
      url: el.querySelector("[name=url]").value.trim(),
      instructions: el.querySelector("[name=instructions]").value.trim(),
      ...(p.provider === "wipay"
        ? {
            account_number: el
              .querySelector("[name=account_number]")
              .value.trim(),
            fee_structure: el.querySelector("[name=fee_structure]").value,
          }
        : {}),
    };
  });
  for (const p of next) {
    if (!p.label)
      throw new Error("Give every payment method a customer-facing label.");
    if (p.url && (!safeURL(p.url) || !p.url.startsWith("https://")))
      throw new Error("Payment links must start with https://.");
    if (p.enabled && ["fygaro", "ncb", "custom"].includes(p.provider) && !p.url)
      throw new Error("Add a secure payment link before enabling " + p.label);
    if (p.enabled && p.provider === "bank" && !p.instructions)
      throw new Error("Add your bank transfer instructions first.");
    if (
      p.enabled &&
      p.provider === "wipay" &&
      !p.url &&
      !/^\d+$/.test(p.account_number)
    )
      throw new Error("Add your WiPay account number or payment link.");
  }
  await saveConfig({ ...config(), payments: next });
}
function requestDetail(id) {
  const s = submissions.find((r) => r.id === id);
  const d = s.data;
  editor.innerHTML = `<form id="request-form"><div class="dialog-header"><div><span class="eyebrow">${esc(s.kind)} RECORD</span><h2>${esc(s.name)}</h2><p>${esc(d.item || s.kind)}</p></div><button class="dialog-close" type="button" data-close>×</button></div><div class="dialog-body"><div class="notice">Check the transaction in your bank / provider dashboard before marking Paid. A customer reference is not payment confirmation.</div><div class="detail-grid">${[
    ["Email", s.email],
    ["Phone", s.phone],
    ["Reference", s.id],
    ["Received", date(s.created_at)],
    ["Amount requested", money(s.amount)],
    ["Payment method", s.payment_method || "Free"],
    ...Object.entries(d)
      .filter(([k]) => !["answers", "payment_url", "payment_links"].includes(k))
      .map(([k, v]) => [
        k.replace(/_/g, " "),
        typeof v === "boolean" ? (v ? "Yes" : "No") : v,
      ]),
    ...(s.form_snapshot || []).map((f) => [
      f.label,
      d.answers?.[f.id] || "No answer",
    ]),
  ]
    .map(
      ([label, v]) => `<div><small>${esc(label)}</small><p>${esc(v)}</p></div>`,
    )
    .join(
      "",
    )}</div><div class="form-grid" style="margin-top:25px"><label class="field">Request / attendance status<select name="status">${["new", "confirmed", "waitlisted", "attended", "completed", "cancelled"].map((v) => `<option ${s.status === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="field">Verified payment status<select name="payment_status">${["pending", "paid", "refunded", "waived"].map((v) => `<option ${s.payment_status === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="field full">Private notes<textarea name="admin_notes" maxlength="10000">${esc(s.admin_notes)}</textarea></label></div></div><div class="dialog-footer"><a class="button" href="mailto:${esc(s.email)}">Email customer</a><button class="button primary" type="submit">Save record</button></div></form>`;
  $("#request-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const updated = await checked(
        db
          .from("bp_submissions")
          .update({
            status: f.elements.status.value,
            payment_status: f.elements.payment_status.value,
            admin_notes: f.elements.admin_notes.value,
          })
          .eq("id", s.id)
          .eq("updated_at", s.updated_at)
          .select(),
      );
      if (!updated.length)
        throw new Error(
          "This record changed in another session. Refresh and try again.",
        );
      editor.close();
      await load();
      toast("Record updated.");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  };
  editor.showModal();
}
async function loadHistory() {
  try {
    const list = await checked(
      db
        .from("bp_revisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    );
    if (active !== "history") return;
    $("#history-list").innerHTML = list.length
      ? list
          .map(
            (r) =>
              `<div class="revision-row"><div><strong>${esc(r.snapshot.title)}</strong><p>${esc(r.snapshot.kind)} · ${date(r.created_at)} · Version ${r.snapshot.version}</p></div><button class="button small" data-restore="${r.id}">Restore version</button></div>`,
          )
          .join("")
      : empty(
          "A fresh beginning.",
          "Your content changes will be recorded here automatically.",
        );
  } catch (e) {
    toast(e.message, true);
  }
}
function exportRequests() {
  const kinds =
    active === "registrations"
      ? ["event"]
      : active === "bookings"
        ? ["booking"]
        : ["enrollment", "tuition"];
  const list = submissions.filter(
    (s) =>
      kinds.includes(s.kind) &&
      (!requestEvent || s.content_id === requestEvent) &&
      (!requestStatus || s.status === requestStatus) &&
      JSON.stringify([s.name, s.email, s.phone, s.data.item, s.id])
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const questions = new Map();
  list.forEach((s) =>
    (s.form_snapshot || []).forEach((f) => questions.set(f.id, f.label)),
  );
  const data = [
    [
      "Reference",
      "Name",
      "Email",
      "Phone",
      "Type",
      "Item",
      "Status",
      "Amount JMD",
      "Payment method",
      "Payment status",
      "Payment reference",
      "Requested date",
      "Requested time",
      "Schedule",
      "Kit",
      "Approach",
      "Address",
      "TRN",
      "Customer notes",
      "Private notes",
      "Received",
      ...questions.values(),
    ],
    ...list.map((s) => [
      s.id,
      s.name,
      s.email,
      s.phone,
      s.kind,
      s.data.item,
      s.status,
      s.amount,
      s.payment_method,
      s.payment_status,
      s.data.payment_reference,
      s.data.date,
      s.data.time,
      s.data.schedule,
      s.data.kit,
      s.data.approach,
      s.data.address,
      s.data.trn,
      s.data.notes,
      s.admin_notes,
      date(s.created_at),
      ...[...questions.keys()].map((id) => s.data.answers?.[id] || ""),
    ]),
  ];
  download(
    "beauty-plus-" +
      active +
      "-" +
      new Date().toISOString().slice(0, 10) +
      ".csv",
    csv(data),
    "text/csv;charset=utf-8",
  );
  toast("CSV exported.");
}
function passwordDialog() {
  editor.innerHTML = `<form id="password-form"><div class="dialog-header"><div><span class="eyebrow">YOUR OWNER ACCOUNT</span><h2>Make this space yours.</h2><p>Choose a password with at least 12 characters.</p></div><button class="dialog-close" type="button" data-close>×</button></div><div class="dialog-body"><label class="field">New password<input type="password" name="password" minlength="12" required autocomplete="new-password"></label><label class="field" style="margin-top:20px">Confirm password<input type="password" name="confirm" minlength="12" required autocomplete="new-password"></label></div><div class="dialog-footer"><span></span><button class="button primary" type="submit">Save password</button></div></form>`;
  $("#password-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (e.target.password.value !== e.target.confirm.value)
        throw new Error("Passwords must match.");
      await checked(db.auth.updateUser({ password: e.target.password.value }));
      editor.close();
      accountRecovery = false;
      history.replaceState({}, "", location.pathname + "#dashboard");
      toast("Password saved. Your studio is ready.");
    } catch (err) {
      toast(err.message, true);
    }
  };
  editor.showModal();
}
function login() {
  app.innerHTML = `<main class="login"><section class="login-art"><a class="brand" href="/"><span class="brand-mark">b<span>+</span></span><div><strong>Beauty Plus</strong><small style="color:#c9b181">THE OWNER STUDIO</small></div></a><div><span class="eyebrow">YOUR BUSINESS. BEAUTIFULLY IN HAND.</span><h1>A space to create.<br>Room to grow.</h1><p>Manage the little details that make your beauty business extraordinary. All in one calm, considered place.</p></div><small style="color:#97afa2;font-size:9px">BEAUTY PLUS ACADEMY & SALON • KINGSTON, JAMAICA</small><span class="big-flower">✳</span></section><section class="login-form"><div class="login-box"><div class="eyebrow">WELCOME TO YOUR STUDIO</div><h2>Beautiful things<br>start here.</h2><p>Sign in to care for your website and your community.</p><form id="login-form"><label class="field">Email address<input type="email" name="email" required autocomplete="username" placeholder="Your owner email"></label><label class="field">Password<input type="password" name="password" required autocomplete="current-password" placeholder="Enter your password"></label><button type="submit" class="button primary">Open my studio ${icon("arrow")}</button><button type="button" class="text-button" data-action="reset-password">Forgot your password?</button></form><div class="notice">First visit? Open the private owner setup link provided with your website, then choose your password. This studio is for approved owner accounts.</div><p style="font-size:10px;text-align:center"><a href="/">← Back to Beauty Plus</a></p></div></section></main>`;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector("button[type=submit]");
    b.disabled = true;
    try {
      await checked(
        db.auth.signInWithPassword({
          email: e.target.email.value.trim(),
          password: e.target.password.value,
        }),
      );
      await start();
    } catch (err) {
      toast(err.message, true);
    } finally {
      b.disabled = false;
    }
  };
}
async function start() {
  try {
    const session = await checked(db.auth.getSession());
    user = session.session?.user;
    if (!user) {
      login();
      return;
    }
    if (!(await checked(db.rpc("bp_is_admin")))) {
      await db.auth.signOut();
      login();
      throw new Error("This email does not have owner access to Beauty Plus.");
    }
    await load();
    shell();
    if (accountRecovery) passwordDialog();
  } catch (e) {
    toast(e.message, true);
    if (!$("#login-form")) login();
  }
}
async function handleAction(a) {
  if (a === "logout") {
    await db.auth.signOut();
    user = null;
    login();
    return;
  }
  if (a === "menu") {
    $(".sidebar").classList.toggle("open");
    return;
  }
  if (a === "save-payments") return savePayments();
  if (a === "save-settings") {
    const f = $("#settings-form");
    if (!f.reportValidity()) return;
    const d = readFields(f, settingFields, config());
    if (d.deposit_percent > 100)
      throw new Error("Deposit percentage must be 0–100.");
    if (!/^\d{10,15}$/.test(d.whatsapp))
      throw new Error(
        "WhatsApp should include the country code and digits only.",
      );
    const allIDs = [...f.querySelectorAll("[name=visible]")].map(
        (el) => el.value,
      ),
      visible = [...f.querySelectorAll("[name=visible]:checked")].map(
        (el) => el.value,
      );
    d.hidden_sections = allIDs.filter((id) => !visible.includes(id));
    return saveConfig(d);
  }
  if (a === "add-payment") {
    const label = prompt("What should customers call this payment option?");
    if (!label) return;
    return saveConfig({
      ...config(),
      payments: [
        ...config().payments,
        {
          id: crypto.randomUUID(),
          provider: "custom",
          label,
          url: "",
          instructions: "",
          enabled: false,
        },
      ],
    });
  }
  if (a === "add-question") {
    $("#builder-fields").insertAdjacentHTML(
      "beforeend",
      builderField(
        { id: crypto.randomUUID(), label: "", type: "text", required: false },
        editor.querySelectorAll(".builder-field").length,
      ),
    );
    return;
  }
  if (a === "preview-form") {
    const fields = readBuilder();
    const help = $("#help");
    help.innerHTML = `<div class="dialog-header"><h2>Registration form preview</h2><button class="dialog-close" data-close>×</button></div><div class="dialog-body form-preview"><p>Full name · Email · Phone</p>${fields.map((f) => `<label class="field" style="margin-bottom:20px">${esc(f.label || "Untitled question")}${f.required ? " *" : ""}${f.type === "select" ? `<select><option>Choose an option</option>${f.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select>` : f.type === "textarea" ? '<textarea placeholder="Your answer"></textarea>' : `<input type="${esc(f.type)}" placeholder="Your answer">`}</label>`).join("")}<p>Payment options and consent appear on paid events. This preview does not submit information.</p></div>`;
    help.showModal();
    return;
  }
  if (a === "backup") {
    await load();
    download(
      "beauty-plus-private-backup-" +
        new Date().toISOString().slice(0, 10) +
        ".json",
      JSON.stringify(
        { exported_at: new Date().toISOString(), content, submissions },
        null,
        2,
      ),
    );
    toast("Private backup exported.");
    return;
  }
  if (a === "export-csv") return exportRequests();
  if (a === "password") return passwordDialog();
  if (a === "reset-password") {
    const email = $("#login-form").email.value.trim();
    if (!email) throw new Error("Enter your owner email address first.");
    await checked(
      db.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/admin/index.html",
      }),
    );
    toast(
      "If email delivery is configured for this account, a password reset link will arrive shortly.",
    );
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button,[data-nav]");
  if (!b) return;
  try {
    if (b.hasAttribute("data-close")) {
      b.closest("dialog").close();
      return;
    }
    if (b.dataset.nav) {
      active = b.dataset.nav;
      search = "";
      viewFilter = "active";
      requestStatus = "";
      requestEvent = "";
      location.hash = active;
      shell();
      return;
    }
    if (b.dataset.help) return showHelp(b.dataset.help);
    if (b.dataset.new) return edit(b.dataset.new);
    if (b.dataset.edit)
      return edit(content.find((r) => r.id === b.dataset.edit));
    if (b.dataset.request) return requestDetail(b.dataset.request);
    if (b.dataset.page) {
      pageFilter = b.dataset.page;
      sectionFilter = "";
      search = "";
      render();
      return;
    }
    if (b.dataset.collection) {
      collection = b.dataset.collection;
      search = "";
      render();
      return;
    }
    if (b.dataset.eventRequests) {
      requestEvent = b.dataset.eventRequests;
      active = "registrations";
      location.hash = active;
      shell();
      return;
    }
    if (b.hasAttribute("data-field-remove")) {
      b.closest(".builder-field").remove();
      return;
    }
    if (b.hasAttribute("data-field-up")) {
      const f = b.closest(".builder-field");
      if (f.previousElementSibling) f.before(f.previousElementSibling);
      return;
    }
    if (b.hasAttribute("data-field-down")) {
      const f = b.closest(".builder-field");
      if (f.nextElementSibling) f.after(f.nextElementSibling);
      return;
    }
    if (b.dataset.archive) {
      const row = content.find((r) => r.id === b.dataset.archive);
      if (
        !confirm(
          row.status === "archived"
            ? "Restore this item as a private draft?"
            : "Hide this item from the website? You can restore it from Archived.",
        )
      )
        return;
      await saveContent({
        ...row,
        status: row.status === "archived" ? "draft" : "archived",
      });
      editor.close();
      await load();
      toast("Item updated.");
      render();
      return;
    }
    if (b.dataset.restore) {
      const r = await checked(
        db
          .from("bp_revisions")
          .select("*")
          .eq("id", b.dataset.restore)
          .single(),
      );
      if (!confirm("Restore this earlier version of " + r.snapshot.title + "?"))
        return;
      const current = content.find((c) => c.id === r.content_id);
      await saveContent(
        { ...r.snapshot, version: current?.version },
        !!current,
      );
      await load();
      toast("Earlier version restored.");
      render();
      return;
    }
    if (b.dataset.action) {
      b.disabled = true;
      try {
        await handleAction(b.dataset.action);
      } finally {
        b.disabled = false;
      }
    }
  } catch (err) {
    toast(err.message, true);
  }
});
document.addEventListener("change", async (e) => {
  const input = e.target;
  if (!input.dataset.upload || !input.files?.[0]) return;
  const file = input.files[0];
  input.disabled = true;
  try {
    if (
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
        file.type,
      )
    )
      throw new Error("Choose a JPG, PNG, WebP, or AVIF image.");
    if (file.size > 10485760)
      throw new Error("Choose an image smaller than 10 MB.");
    const ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/avif": "avif",
      }[file.type],
      path = crypto.randomUUID() + "." + ext;
    await checked(
      db.storage
        .from("bp-media")
        .upload(path, file, { contentType: file.type, upsert: false }),
    );
    const { data } = db.storage.from("bp-media").getPublicUrl(path);
    const field = input.closest("label");
    field.querySelector(`[name="${input.dataset.upload}"]`).value =
      data.publicUrl;
    let img = field.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      field.append(img);
    }
    img.src = data.publicUrl;
    img.alt = "Uploaded image preview";
    toast("Image uploaded. Save the item to apply it.");
  } catch (err) {
    toast(err.message, true);
  } finally {
    input.disabled = false;
  }
});
window.addEventListener("hashchange", () => {
  if (user) {
    const next = location.hash.slice(1);
    if (sections.some((s) => s[0] === next) && active !== next) {
      active = next;
      shell();
    }
  }
});
accountRecovery =
  location.hash.includes("type=recovery") ||
  location.hash.includes("type=invite");
db.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") accountRecovery = true;
  if (event === "SIGNED_OUT" && user) {
    user = null;
    login();
  }
});
start();
