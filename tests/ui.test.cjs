const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "../scripts/node_modules/@playwright/test",
);
const root = path.resolve(__dirname, "..");
test("owner studio and public forms work on desktop and mobile with isolated API fixtures", async () => {
  const launch = { headless: true };
  if (process.env.CHROMIUM_PATH) {
    launch.executablePath = process.env.CHROMIUM_PATH;
    launch.args = [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--single-process",
    ];
  }
  const browser = await chromium.launch(launch);
  try {
    let rows = JSON.parse(
        fs.readFileSync(path.join(root, "supabase/seed-content.json")),
      ).map((r) => ({
        ...r,
        version: 1,
        updated_at: new Date().toISOString(),
      })),
      submissions = [],
      errors = [];
    let enrollmentDocument = null;
    let staffMode = false,
      products = [],
      orders = [],
      invoices = [],
      shifts = [],
      savedSale = null;
    const held = [];
    const staff = [],
      deliveries = [
        {
          id: "30000000-0000-4000-8000-000000000009",
          name: "Collect at the salon",
          type: "pickup",
          fee: 0,
          areas: [],
          active: true,
          updated_at: new Date().toISOString(),
        },
      ];
    const doc = () => ({
      invoice: invoices[0] || {
        id: "50000000-0000-4000-8000-000000000001",
        number: 1,
        customer_name: "Test Client",
        customer_email: "test@example.com",
        customer_phone: "8765550000",
        source_kind: "booking",
        total: 6500,
        subtotal: 6500,
        tax: 0,
        discount: 0,
        delivery_fee: 0,
        paid: 0,
        refunded: 0,
        due_now: 3100,
        status: "unpaid",
        created_at: new Date().toISOString(),
        items: [
          {
            name: "Beauty appointment",
            quantity: 1,
            unit_price: 6500,
            line_total: 6500,
          },
        ],
      },
      business: rows.find((r) => r.id === "site-settings").data,
      branding: {
        invoice_accent: "#183d3c",
        invoice_footer: "Thank you for choosing Beauty Plus.",
      },
      access_token: "60000000-0000-4000-8000-000000000001",
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    await context.routeWebSocket("wss://**", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.hostname === "localhost") {
        const name = decodeURIComponent(
            url.pathname === "/"
              ? "/index.html"
              : url.pathname.endsWith("/")
                ? url.pathname + "index.html"
                : url.pathname,
          ),
          file = path.join(root, name);
        if (!file.startsWith(root)) return route.fulfill({ status: 403 });
        if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
        const ext = path.extname(file);
        return route.fulfill({
          body: fs.readFileSync(file),
          contentType:
            {
              ".js": "text/javascript",
              ".css": "text/css",
              ".html": "text/html",
              ".png": "image/png",
              ".jpg": "image/jpeg",
            }[ext] || "application/octet-stream",
        });
      }
      if (url.hostname.endsWith(".supabase.co")) {
        const cors = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        };
        if (req.method() === "OPTIONS")
          return route.fulfill({ status: 200, headers: cors });
        let data = [];
        if (url.pathname.includes("rpc/bp_access_context"))
          data = staffMode
            ? {
                is_admin: false,
                can_pos: true,
                can_book: true,
                staff: {
                  id: "70000000-0000-4000-8000-000000000001",
                  name: "Fixture employee",
                  active: true,
                  force_password_change: false,
                  can_pos: true,
                  can_book: true,
                },
              }
            : { is_admin: true, can_pos: true, can_book: true, staff: null };
        else if (url.pathname.includes("rpc/bp_command")) {
          const { p_action: a, p } = req.postDataJSON();
          if (a === "product_costs") data = {};
          else if (a === "slots") data = ["09:00", "10:00", "11:00"];
          else if (a === "receipt") {
            const r = submissions.find((s) => s.id === p.id);
            if (r?.kind === "enrollment")
              enrollmentDocument = {
                ...doc(),
                access_token: "60000000-0000-4000-8000-000000000003",
                invoice: {
                  ...doc().invoice,
                  customer_name: r.name,
                  customer_email: r.email,
                  customer_phone: r.phone,
                  source_kind: "course",
                  total: 70000,
                  subtotal: 70000,
                  paid: 5000,
                },
                request: { kind: "enrollment", content_id: r.content_id },
              };
            data = {
              amount: r?.kind === "booking" ? 3100 : r?.amount || 0,
              status: "new",
              invoice_id: doc().invoice.id,
              access_token: ["enrollment", "tuition"].includes(r?.kind)
                ? "60000000-0000-4000-8000-000000000003"
                : doc().access_token,
            };
          } else if (a === "document" || a === "invoice_for")
            data =
              p.token === "60000000-0000-4000-8000-000000000003"
                ? enrollmentDocument
                : doc();
          else if (a === "save_product") {
            const row = {
              ...p,
              id: p.id || "30000000-0000-4000-8000-000000000001",
              price: Number(p.price),
              tax_rate: Number(p.tax_rate),
              stock_qty: Number(p.stock_qty),
              low_stock: Number(p.low_stock),
              updated_at: new Date().toISOString(),
            };
            products = products.filter((v) => v.id !== row.id).concat(row);
            data = { id: row.id };
          } else if (a === "save_delivery") {
            const row = {
              ...p,
              id: p.id || "30000000-0000-4000-8000-000000000002",
            };
            deliveries.push(row);
            data = { id: row.id };
          } else if (a === "shift_open") {
            const sh = {
              id: "40000000-0000-4000-8000-000000000001",
              operator_id: "00000000-0000-4000-8000-000000000001",
              opening_cash: Number(p.opening_cash),
              closed_at: null,
              opened_at: new Date().toISOString(),
            };
            shifts.push(sh);
            data = sh;
          } else if (a === "hold_cart") {
            held.push({
              id: "90000000-0000-4000-8000-000000000001",
              label: p.label,
              cart: p.cart,
              created_at: new Date().toISOString(),
            });
            data = { ok: true };
          } else if (a === "resume_cart") {
            const index = held.findIndex((h) => h.id === p.id);
            data = index < 0 ? null : held.splice(index, 1)[0].cart;
          } else if (a === "sale") {
            savedSale = p;
            const invoice = {
              ...doc().invoice,
              id: "50000000-0000-4000-8000-000000000002",
              number: 2,
              total: 2000,
              subtotal: 2000,
              paid: 2000,
              status: "paid",
              source_kind: "store",
              items: [
                {
                  name: "Everyday shampoo",
                  quantity: 2,
                  unit_price: 1000,
                  line_total: 2000,
                },
              ],
            };
            invoices.unshift(invoice);
            orders.unshift({
              id: "80000000-0000-4000-8000-000000000001",
              number: 1,
              channel: "pos",
              customer_name: "Walk-in customer",
              customer_email: "",
              total: 2000,
              status: "completed",
              created_at: new Date().toISOString(),
            });
            products[0].stock_qty = 8;
            data = {
              invoice_id: invoice.id,
              total: invoice.total,
              change: Math.max(
                0,
                Number(p.cash_received) -
                  p.payments
                    .filter((v) => v.method === "cash")
                    .reduce((n, v) => n + v.amount, 0),
              ),
            };
          } else if (a === "finance")
            data = {
              gross_received: 6500,
              refunds: 500,
              net_received: 6000,
              outstanding: 12000,
              invoices_issued: 4,
              daily: [
                { day: "2026-11-01", amount: 1000 },
                { day: "2026-11-02", amount: 2000 },
                { day: "2026-11-03", amount: 3000 },
              ],
              categories: [
                { source_kind: "store", amount: 3000 },
                { source_kind: "course", amount: 2000 },
                { source_kind: "booking", amount: 1000 },
              ],
              methods: [
                { method: "cash", amount: 3000 },
                { method: "bank", amount: 3000 },
              ],
              top_products: [
                {
                  name: "Everyday shampoo",
                  units: 2,
                  sales: 2000,
                  margin_before_discounts: 1200,
                },
              ],
              staff_sales: [{ name: "Owner", sales: 1, total: 2000 }],
              transactions: [],
            };
          else data = { ok: true };
        } else if (url.pathname.includes("/functions/v1/bp-business")) {
          const { action, data: p } = req.postDataJSON();
          if (action === "email_status") data = { configured: false };
          else if (action === "email_preview")
            data = {
              subject: "Your Beauty Plus booking",
              html: "<html><body><h1>Your appointment invoice</h1></body></html>",
            };
          else if (action === "staff_save") {
            staff.push({
              ...p,
              id: "70000000-0000-4000-8000-000000000001",
              user_id: "00000000-0000-4000-8000-000000000002",
            });
            data = { ok: true };
          } else data = { ok: true };
        } else if (url.pathname.includes("bp_products")) data = products;
        else if (url.pathname.includes("bp_deliveries")) data = deliveries;
        else if (url.pathname.includes("bp_orders")) data = orders;
        else if (url.pathname.includes("bp_invoices")) data = invoices;
        else if (url.pathname.includes("bp_staff")) data = staff;
        else if (url.pathname.includes("bp_shifts")) data = shifts;
        else if (url.pathname.includes("bp_held_carts")) data = held;
        else if (url.pathname.includes("rpc/bp_request_quote")) {
          const row = submissions.find((s) => s.id === req.postDataJSON().p_id);
          data = row
            ? [
                {
                  amount: row.kind === "booking" ? 3100 : row.amount,
                  status: row.status || "new",
                },
              ]
            : [];
        } else if (url.pathname.includes("rpc/bp_is_admin")) data = true;
        else if (url.pathname.includes("bp_content")) {
          if (req.method() === "POST") {
            const v = req.postDataJSON();
            rows.push({ ...v, version: 1 });
            data = [v];
          } else if (req.method() === "PATCH") {
            const id = url.searchParams.get("id")?.replace("eq.", "");
            const v = req.postDataJSON(),
              old = rows.find((r) => r.id === id);
            Object.assign(old, v, { version: old.version + 1 });
            data = [old];
          } else
            data = rows.filter(
              (r) =>
                !url.searchParams.has("status") || r.status === "published",
            );
        } else if (url.pathname.includes("bp_submissions")) {
          if (req.method() === "POST") {
            submissions.push(req.postDataJSON());
            return route.fulfill({ status: 201, headers: cors, body: "" });
          }
          data = submissions;
        } else if (url.pathname.includes("bp_revisions")) data = [];
        return route.fulfill({
          status: 200,
          headers: { ...cors, "content-type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      return route.fulfill({ status: 204, body: "" });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGE ERROR", e.message);
    });
    page.on("console", (m) => {
      if (m.type() === "error") console.log("BROWSER ERROR", m.text());
    });
    await page.goto("http://localhost/admin/");
    await page.waitForSelector("#login-form");
    if (process.env.BP_SCREENSHOTS)
      await page.screenshot({ path: "/tmp/beauty-login.png", fullPage: true });
    const user = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "fixture-owner@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    await page.evaluate(
      ({ user, payload }) =>
        localStorage.setItem(
          "beauty-plus-owner",
          JSON.stringify({
            access_token: "eyJhbGciOiJIUzI1NiJ9." + payload + ".fixture",
            refresh_token: "fixture",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
        ),
      { user, payload },
    );
    await page.reload();
    await page.waitForSelector(".stats");
    assert.match(await page.locator("h1").textContent(), /beautiful day/);
    if (process.env.BP_SCREENSHOTS)
      await page.screenshot({
        path: "/tmp/beauty-dashboard.png",
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Salon services", exact: true })
      .click();
    await page.locator('[data-edit="service-1"]').click();
    await page.locator("#editor [name=price]").fill("6250");
    await page
      .getByRole("button", { name: "Save service", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector("#editor").open);
    assert.equal(rows.find((r) => r.id === "service-1").data.price, 6250);
    await page
      .getByRole("button", { name: "Events & forms", exact: true })
      .click();
    await page.locator("[data-new=event]").click();
    await page.locator("#editor [name=title]").fill("Beauty masterclass");
    await page.locator("#editor [name=starts_at]").fill("2027-02-01T10:00");
    await page.locator("#editor [name=location]").fill("Kingston studio");
    await page.locator("#editor [name=capacity]").fill("10");
    await page.locator("#editor [name=status]").selectOption("published");
    await page
      .getByRole("button", { name: "Add a question", exact: true })
      .click();
    await page.locator("[name=question_label]").fill("Experience level");
    await page.locator("[name=question_type]").selectOption("select");
    await page.locator("[name=question_options]").fill("Beginner\nExperienced");
    await page.locator("[name=question_required]").check();
    await page
      .getByRole("button", { name: "Preview form", exact: true })
      .click();
    await page.locator("#help [data-close]").click();
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("#editor").open);
    assert.equal(
      rows.find((r) => r.title === "Beauty masterclass").data.fields[0].label,
      "Experience level",
    );
    await page
      .getByRole("button", { name: "Payment methods", exact: true })
      .click();
    await page
      .locator('[data-payment-index="1"] [name=instructions]')
      .fill("Use your request reference when transferring.");
    await page
      .getByRole("button", { name: "Save payment methods", exact: true })
      .click();
    await page.waitForTimeout(200);
    assert.equal(
      rows.find((r) => r.id === "site-settings").data.payments[1].instructions,
      "Use your request reference when transferring.",
    );
    await page
      .getByRole("button", { name: "Gallery & stories", exact: true })
      .click();
    await page.locator("[data-new=gallery]").click();
    await page
      .locator("#editor [name=title]")
      .fill("A beautiful transformation");
    await page.locator("#editor [data-upload=image]").setInputFiles({
      name: "work.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lTkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#editor [name=image]")
        .value.includes("/storage/v1/object/public/bp-media/"),
    );
    await page
      .locator("#editor [name=story]")
      .fill("The story behind our client’s new look.");
    await page.locator("#editor [name=consent]").check();
    await page.locator("#editor [name=status]").selectOption("published");
    await page
      .getByRole("button", { name: "Save gallery", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector("#editor").open);
    assert.ok(
      rows
        .find((r) => r.title === "A beautiful transformation")
        .data.image.includes("bp-media"),
    );
    for (const section of [
      "Website pages",
      "Training & courses",
      "Gallery & stories",
      "Event registrations",
      "Booking requests",
      "Students & tuition",
      "Reviews & FAQs",
      "Business settings",
      "Activity & backups",
    ]) {
      await page.getByRole("button", { name: section, exact: true }).click();
      await page.waitForTimeout(50);
      assert.ok(
        await page.locator("#content h1").count(),
        section + " rendered",
      );
      await page.locator("#content [data-help]").first().click();
      assert.ok(await page.locator("#help").isVisible());
      await page.locator("#help [data-close]").first().click();
    }
    await page.goto("http://localhost/salon.html");
    await page.waitForSelector("#bp-business");
    assert.equal(await page.locator("#serviceGrid .service-card").count(), 41);
    await page.locator("#bookingService").selectOption("service-1");
    assert.match(
      await page.locator("#depositAmountDisplay").textContent(),
      /3,125/,
    );
    await page.locator("#bookingName").fill("Test Client");
    await page.locator("#bookingPhone").fill("8765550000");
    await page.locator("#bookingEmail").fill("test@example.com");
    await page.locator("#bookingContactMethod").selectOption("Email");
    await page.locator("#bookingDate").fill("2027-03-01");
    await page.locator("#bookingTime").selectOption("10:00");
    await page.locator("#bookingForm [name=bp_payment]").selectOption("bank");
    await page.locator("#bookingForm .bp-consent input").check();
    await page.locator("#bookingSubmitBtn").click();
    await page.waitForSelector(".bp-dialog[open]");
    assert.equal(submissions.at(-1).amount, 3125);
    assert.match(
      await page.locator(".bp-dialog[open]").textContent(),
      /3,100/,
      "Confirmation uses the authoritative server amount",
    );
    await page.locator(".bp-dialog[open] .bp-close").click();
    await page.goto("http://localhost/enroll.html");
    await page.waitForSelector("#bp-business");
    assert.equal(await page.locator(".course-card").count(), 11);
    await page.locator("#courseSelect").selectOption("course-1");
    assert.match(await page.locator("#summaryPrice").textContent(), /65,000/);
    await page.locator("#tCourseSelect").selectOption("course-2");
    assert.equal(await page.locator("#tAmount").inputValue(), "75000");
    await page.locator("#firstName").fill("Student");
    await page.locator("#lastName").fill("Applicant");
    await page.locator("#email").fill("student@example.com");
    await page.locator("#phone").fill("8765550003");
    await page.locator("#street1").fill("Test Street");
    await page.locator("#city").fill("Kingston");
    await page.locator("#trn").fill("000000000");
    await page
      .locator("#registrationForm [name=bp_payment]")
      .selectOption("bank");
    await page.locator("#registrationForm .bp-consent input").check();
    await page.locator("#registrationForm button[type=submit]").click();
    await page.waitForSelector(".bp-dialog[open]");
    assert.equal(submissions.at(-1).kind, "enrollment");
    assert.equal(submissions.at(-1).data.trn, "000000000");
    await page.locator(".bp-dialog[open] .bp-close").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#tuition-invoice-help")
        .textContent.includes("65,000"),
    );
    assert.equal(await page.locator("#tFirstName").inputValue(), "Student");
    assert.equal(await page.locator("#tCourseSelect").inputValue(), "course-1");
    assert.equal(await page.locator("#tAmount").inputValue(), "65000");
    await page.locator("[name=tPaymentType][value=custom]").check();
    await page.locator("#tAmount").fill("10000");
    await page.locator("#tuitionForm [name=bp_payment]").selectOption("bank");
    await page.locator("#tuitionForm .bp-consent input").check();
    await page.locator("#tuitionForm button[type=submit]").click();
    await page.waitForSelector(".bp-dialog[open]");
    assert.equal(submissions.at(-1).kind, "tuition");
    assert.equal(
      submissions.at(-1).data.enrollment_token,
      "60000000-0000-4000-8000-000000000003",
    );
    assert.equal(submissions.at(-1).amount, 10000);

    await page.goto("http://localhost/admin/#students");
    await page.waitForSelector(".table-wrap");
    const [exported] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-action=export-csv]").click(),
    ]);
    const exportedCSV = fs.readFileSync(await exported.path(), "utf8");
    assert.match(exportedCSV, /000000000/);
    const csvLines = exportedCSV.split("\r\n");
    assert.equal(
      csvLines[0].match(/"(?:[^"]|"")*"/g).length,
      csvLines[1].match(/"(?:[^"]|"")*"/g).length,
      "CSV headers align with private enrollment fields",
    );
    await page.goto("http://localhost/events.html");
    await page.waitForSelector("[data-event]");
    await page.locator("[data-event]").click();
    await page.locator("#bp-event-form [name=name]").fill("Workshop Attendee");
    await page
      .locator("#bp-event-form [name=email]")
      .fill("attendee@example.com");
    await page.locator("#bp-event-form [name=phone]").fill("8765550001");
    await page
      .locator("#bp-event-form [name^=field_]")
      .selectOption("Beginner");
    await page
      .getByRole("button", { name: "Send registration", exact: true })
      .click();
    await page.waitForTimeout(200);
    assert.equal(submissions.at(-1).kind, "event");
    assert.equal(Object.values(submissions.at(-1).data.answers)[0], "Beginner");
    await page.goto("http://localhost/index.html");
    await page.waitForSelector("#bp-home-courses p");
    assert.equal(await page.locator("#bp-home-courses p").count(), 8);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://localhost/admin/#dashboard");
    await page.waitForSelector(".stats");
    if (process.env.BP_SCREENSHOTS)
      await page.screenshot({ path: "/tmp/beauty-mobile.png", fullPage: true });
    await page.locator("[data-action=menu]").click();
    await page
      .getByRole("button", { name: "Events & forms", exact: true })
      .click();
    assert.equal(
      await page
        .locator("body")
        .evaluate((e) => e.scrollWidth <= window.innerWidth),
      true,
      "No mobile horizontal overflow",
    );
    rows.push({
      id: "qa-popup",
      kind: "promotion",
      title: "A fresh offer",
      status: "published",
      version: 1,
      data: {
        display: "popup",
        description: "A beautiful special",
        pages: ["index.html"],
      },
    });
    await page.goto("http://localhost/index.html");
    await page.waitForSelector("[data-bp-promo=qa-popup][open]");
    await page.locator("[data-bp-promo=qa-popup] .bp-close").click();
    await page.reload();
    await page.waitForSelector("#bp-business");
    assert.equal(
      await page.locator("[data-bp-promo=qa-popup][open]").count(),
      0,
      "Popup dismissed for this session",
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto("http://localhost/admin/pos.html");
    await page.waitForSelector(".pos-catalog-empty");
    assert(
      (await page.locator(".pos-catalog-empty").boundingBox()).width > 400,
      "Empty catalog uses the entire product pane",
    );
    await page.goto("http://localhost/admin/#products");
    await page.waitForSelector("[data-studio=product-new]");
    await page.locator("[data-studio=product-new]").click();
    await page.locator("#studio-form [name=name]").fill("Everyday shampoo");
    await page.locator("#studio-form [name=sku]").fill("BP-SHAMPOO-001");
    await page.locator("#studio-form [name=price]").fill("1000");
    await page.locator("#studio-form [name=stock_qty]").fill("10");
    await page.locator("#studio-form [name=status]").selectOption("published");
    await page
      .getByRole("button", { name: "Save product", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector("#editor").open);
    assert.equal(products[0].name, "Everyday shampoo");
    // Extra products exist only inside this isolated API fixture.
    for (const [index, name, category] of [
      [3, "Curl cream", "Hair care"],
      [4, "Nail care oil", "Nail care"],
      [5, "Detangling brush", "Tools"],
      [6, "Skin cleanser", "Skin care"],
      [7, "Beauty pouch", "Accessories"],
      [8, "Hair serum", "Hair care"],
    ])
      products.push({
        id: "30000000-0000-4000-8000-" + String(index).padStart(12, "0"),
        name,
        category,
        sku: "FIXTURE-" + index,
        price: 1000 + index * 100,
        tax_rate: 0,
        stock_qty: 20,
        low_stock: 5,
        track_stock: true,
        status: "published",
        barcode: "QA000" + index,
      });

    await page
      .getByRole("button", { name: "Point of sale", exact: true })
      .click();
    await page.waitForURL("**/admin/pos.html");
    await page.waitForSelector(".pos-product");
    assert.equal(
      await page.locator(".sidebar").count(),
      0,
      "POS is a separate terminal without the admin sidebar",
    );
    await page.locator("[data-pos=open-till]").click();
    await page.locator("#pos-dialog [name=opening_cash]").fill("500");
    await page.getByRole("button", { name: "Open till", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector("#pos-dialog").open,
    );
    await page
      .locator('[data-pos=category][data-category="Hair care"]')
      .click();
    assert.equal(await page.locator(".pos-product").count(), 2);
    await page.locator('[data-pos=category][data-category=""]').click();
    await page.locator("#pos-search").fill("BP-SHAMPOO-001");
    await page.locator("#pos-search").press("Enter");
    assert.equal(await page.locator("#pos-search").inputValue(), "");
    await page.locator(".pos-product").first().click();
    assert.match(await page.locator(".pos-grand").textContent(), /2,000/);
    if (process.env.BP_SCREENSHOTS)
      await page.screenshot({
        path: "/tmp/bp-pos-terminal.png",
        fullPage: true,
      });
    await page.locator("[data-pos=pay]").click();
    await page.locator("#pos-discount").fill("");
    await page.locator("#pos-discount").pressSequentially("0.50");
    assert.equal(
      await page.locator("#pos-discount").inputValue(),
      "0.50",
      "Decimal discount typing is preserved",
    );
    assert.match(await page.locator(".pos-grand").textContent(), /1,999.50/);
    await page.locator("#pos-discount").fill("0");
    for (const key of ["2", "5", "0", "0"])
      await page.locator(`[data-pos=key][data-key="${key}"]`).click();
    assert.equal(await page.locator("#pos-received").inputValue(), "2500");
    assert.match(await page.locator("#cash-change").textContent(), /500/);
    if (process.env.BP_SCREENSHOTS)
      await page.screenshot({
        path: "/tmp/bp-pos-payment.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForSelector("#pos-paper-receipt");
    assert.equal(savedSale.items[0].qty, 2);
    assert.equal(savedSale.payments[0].amount, 2000);
    assert.match(
      await page.locator(".pos-completion-change").textContent(),
      /500/,
    );
    await page.locator("[data-pos=new-sale]").click();
    await page.locator(".pos-product").first().click();
    await page.locator("[data-pos=hold]").click();
    await page.locator("#pos-dialog [name=label]").fill("Customer coming back");
    await page
      .getByRole("button", { name: "Hold sale", exact: true })
      .last()
      .click();
    await page.waitForFunction(
      () => !document.querySelector("#pos-dialog").open,
    );
    await page.getByRole("button", { name: "Held", exact: true }).click();
    await page.locator("[data-pos=resume]").click();
    await page.waitForSelector(".pos-basket-line");
    await page.locator(".pos-product").first().click();
    await page.locator("[data-pos=pay]").click();
    await page.locator("[data-pos=method][data-method=split]").click();
    await page.locator("#pos-cash").fill("600");
    await page.locator("#pos-card").fill("1400");
    await page.locator("#pos-received").fill("1000");
    await page.getByRole("button", { name: /Complete sale/ }).click();
    assert.match(
      await page.locator(".pos-form-error").textContent(),
      /Confirm/,
    );
    await page.locator("#pos-confirmed").check();
    await page.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForSelector("#pos-paper-receipt");
    assert.equal(savedSale.payments.length, 2);
    assert.match(
      await page.locator(".pos-completion-change").textContent(),
      /400/,
    );
    await page.locator("[data-pos=new-sale]").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".pos-product").first().click();
    await page.locator("[data-pos=mobile-cart]").click();
    assert(
      await page.locator("[data-pos=pay]").isVisible(),
      "Phone has a dedicated basket view",
    );
    const charge = await page.locator("[data-pos=pay]").boundingBox();
    assert(
      charge.y + charge.height <= 845,
      "Charge stays within the phone viewport",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Terminal does not overflow horizontally on a phone",
    );
    if (process.env.BP_SCREENSHOTS)
      await page.screenshot({ path: "/tmp/bp-pos-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page
      .getByRole("link", { name: "Back to studio", exact: true })
      .click();
    await page.waitForSelector(".sidebar nav");
    await page
      .getByRole("button", { name: "Business settings", exact: true })
      .click();
    const menuPosition = await page
      .locator(".sidebar nav")
      .evaluate((el) => el.scrollTop);
    assert(menuPosition > 100, "A lower menu item is in view");
    await page
      .getByRole("button", { name: "Activity & backups", exact: true })
      .click();
    const afterPosition = await page
      .locator(".sidebar nav")
      .evaluate((el) => el.scrollTop);
    assert(
      Math.abs(afterPosition - menuPosition) < 10,
      "Tab changes preserve the menu scroll position",
    );
    await page
      .getByRole("button", { name: "Financial overview", exact: true })
      .click();
    await page.waitForSelector(".finance-line");
    assert.match(await page.locator("#finance-report").textContent(), /6,000/);
    if (process.env.BP_SCREENSHOTS)
      await page.screenshot({ path: "/tmp/bp-finance.png", fullPage: true });
    await page
      .getByRole("button", { name: "Your employees", exact: true })
      .click();
    await page.locator("[data-studio=staff-new]").click();
    await page.locator("#studio-form [name=name]").fill("Beauty Plus Cashier");
    await page.locator("#studio-form [name=email]").fill("cashier@example.com");
    await page
      .locator("#studio-form [name=password]")
      .fill("TemporaryFixturePassword123!");
    await page
      .getByRole("button", { name: "Save employee account", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector("#editor").open);
    assert.equal(staff[0].can_pos, true);
    await page
      .getByRole("button", { name: "Emails & branding", exact: true })
      .click();
    await page.waitForSelector("#email-status");
    assert.match(
      await page.locator("#email-status").textContent(),
      /setup|Checking/,
    );
    await page.goto("http://localhost/shop.html");
    await page.waitForSelector(".shop-product");
    assert.match(
      await page.locator(".shop-product").first().textContent(),
      /Everyday shampoo/,
    );
    await page.locator("[data-shop=add]").first().click();
    await page.locator("[data-shop=cart]").click();
    assert.match(await page.locator(".shop-cart-total").textContent(), /1,000/);
    await page.locator(".shop-dialog .bp-close").click();
    await page.goto(
      "http://localhost/invoice.html?token=" + doc().access_token,
    );
    await page.waitForSelector(".invoice-sheet");
    const [pdf] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#invoice-download").click(),
    ]);
    assert.equal(
      fs
        .readFileSync(await pdf.path())
        .subarray(0, 4)
        .toString(),
      "%PDF",
    );
    staffMode = true;
    await page.goto("http://localhost/admin/#pos");
    await page.waitForSelector(".pos-sale-layout");
    assert.equal(
      await page
        .getByRole("button", { name: "Financial overview", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Website pages", exact: true })
        .count(),
      0,
    );
    await page.evaluate(() => (location.hash = "finance"));
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".finance-line").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Verified owner/staff permissions, CMS help, booking and secure course flow, event forms, product management, standalone POS/keypad/split tenders/held sales/mobile basket/menu scroll, finance charts, employee/email setup, storefront, PDF download, and mobile navigation.",
    );
  } finally {
    await browser.close();
  }
});
