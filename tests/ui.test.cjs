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
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
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
        if (url.pathname.includes("rpc/bp_is_admin")) data = true;
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
    await page
      .locator("#editor [data-upload=image]")
      .setInputFiles({
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
    await page.locator("#bookingTime").selectOption("Flexible");
    await page.locator("#bookingForm [name=bp_payment]").selectOption("bank");
    await page.locator("#bookingForm .bp-consent input").check();
    await page.locator("#bookingSubmitBtn").click();
    await page.waitForSelector(".bp-dialog[open]");
    assert.equal(submissions.at(-1).amount, 3125);
    await page.locator(".bp-dialog[open] .bp-close").click();
    await page.goto("http://localhost/enroll.html");
    await page.waitForSelector("#bp-business");
    assert.equal(await page.locator(".course-card").count(), 11);
    await page.locator("#courseSelect").selectOption("course-1");
    assert.match(await page.locator("#summaryPrice").textContent(), /65,000/);
    await page.locator("#tCourseSelect").selectOption("course-2");
    assert.equal(await page.locator("#tAmount").inputValue(), "75000");
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
    assert.deepEqual(errors, []);
    console.log(
      "Verified dashboard, 14 sections and help, price edit, event form builder, payment settings, public booking, tuition totals, signup answers, homepage catalog, mobile menu.",
    );
  } finally {
    await browser.close();
  }
});
