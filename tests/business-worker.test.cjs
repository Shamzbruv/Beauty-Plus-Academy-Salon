const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("../scripts/node_modules/esbuild");
const { PDFDocument } = require("../scripts/node_modules/pdf-lib");

test("business worker enforces roles, blocks missing setup, and retries a stable branded PDF email", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bp-worker-"));
  const originalFetch = global.fetch;
  let handler,
    role = "owner",
    providerKey = "",
    responseOK = false;
  const calls = [],
    messages = [];
  const document = {
    invoice: {
      number: 42,
      customer_name: "Customer <script>alert(1)</script>",
      customer_email: "fixture@example.com",
      customer_phone: "8760000000",
      source_kind: "booking",
      total: 4000,
      subtotal: 4000,
      tax: 0,
      discount: 0,
      delivery_fee: 0,
      paid: 0,
      refunded: 0,
      due_now: 2000,
      status: "unpaid",
      created_at: "2026-11-05T15:00:00Z",
      items: [
        {
          name: "Fixture service",
          quantity: 1,
          unit_price: 4000,
          line_total: 4000,
        },
      ],
    },
    business: {
      name: "Beauty Plus",
      address: "Kingston, Jamaica",
      phone: "8760000000",
      email: "fixture@example.com",
    },
    branding: {
      email_from: "salon@example.com",
      email_from_name: "Beauty Plus",
      email_reply_to: "owner@example.com",
    },
    request: { date: "2026-12-12", time: "10:00" },
  };
  const job = { id: "fixture-job", snapshot: null };
  const client = {
    rpc: async (name, args = {}) => {
      if (name === "bp_access_context")
        return {
          data: {
            is_admin: role === "owner",
            can_pos: role === "staff",
            has_session: role !== "revoked",
            staff: role === "owner" ? null : { active: true },
          },
        };
      assert.equal(name, "bp_server_command");
      const a = args.p_action,
        p = args.p || {};
      calls.push({ a, p });
      let data = { ok: true };
      if (a === "config") data = { resend_api_key: providerKey };
      else if (a === "claim_emails") data = [job];
      else if (a === "email_data")
        data = {
          document,
          recipient: "fixture@example.com",
          access_token: "60000000-0000-4000-8000-000000000001",
          template: {
            enabled: true,
            subject: "Your invoice {{invoice_number}}",
            heading: "Welcome, {{customer_name}}",
            body: "Thank you, {{customer_name}}. Your invoice is attached.",
            footer: "Beauty Plus",
          },
        };
      else if (a === "email_result" && p.snapshot) job.snapshot = p.snapshot;
      return { data, error: null };
    },
    auth: {
      getUser: async (token) =>
        token === "fixture-valid"
          ? { data: { user: { id: "fixture-user" } } }
          : {
              data: { user: null },
              error: { message: "Invalid fixture token" },
            },
      admin: { updateUserById: async () => ({ error: null }) },
    },
  };
  global.__bpFixture = { client };
  global.Deno = {
    env: {
      get: (k) =>
        ({
          SUPABASE_URL: "https://fixture.invalid",
          SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
          SUPABASE_ANON_KEY: "fixture-gateway",
          BP_WORKER_KEY: "fixture-worker",
        })[k],
    },
    serve: (fn) => {
      handler = fn;
    },
  };
  global.EdgeRuntime = { waitUntil: () => {} };
  global.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://api.resend.com/emails",
      "Only the mocked provider endpoint is used",
    );
    messages.push({ headers: options.headers, body: JSON.parse(options.body) });
    return new Response(
      JSON.stringify(
        responseOK
          ? { id: "provider-fixture" }
          : { message: "Fixture retry response" },
      ),
      {
        status: responseOK ? 200 : 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  try {
    await esbuild.build({
      entryPoints: [
        path.resolve(__dirname, "../supabase/functions/bp-business/index.ts"),
      ],
      outfile: path.join(temp, "worker.cjs"),
      bundle: true,
      format: "cjs",
      platform: "node",
      nodePaths: [path.resolve(__dirname, "../scripts/node_modules")],
      plugins: [
        {
          name: "isolate-network-clients",
          setup(build) {
            build.onResolve({ filter: /^npm:/ }, (args) => ({
              path: args.path,
              namespace: "fixture",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
              contents: args.path.includes("web-push")
                ? 'export default {setVapidDetails(){},async sendNotification(){throw new Error("Push is not invoked in this fixture")}};'
                : "export const createClient=()=>globalThis.__bpFixture.client;",
              loader: "js",
            }));
          },
        },
      ],
    });
    require(path.join(temp, "worker.cjs"));
    const invoke = (
      action,
      data = {},
      headers = { Authorization: "Bearer fixture-valid" },
    ) =>
      handler(
        new Request("https://fixture.invalid/business", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ action, data }),
        }),
      );
    assert.equal((await invoke("email_status", {}, {})).status, 401);
    role = "staff";
    assert.equal(
      (await invoke("email_config", { api_key: "not-a-real-key" })).status,
      403,
    );
    role = "revoked";
    assert.equal(
      (await invoke("self_password", { password: "FixturePasswordOnly123!" }))
        .status,
      403,
      "Revoked employee session cannot change the password",
    );
    role = "owner";
    assert.deepEqual(await (await invoke("email_status")).json(), {
      configured: false,
      provider: "Resend",
    });
    assert.equal(
      (await invoke("process")).status,
      401,
      "Worker secret required",
    );
    await invoke("process", {}, { "x-bp-worker-key": "fixture-worker" });
    assert.equal(messages.length, 0);
    assert(
      calls.some((x) => x.a === "email_result" && x.p.status === "blocked"),
    );
    providerKey = "fixture-provider-key";
    let result = await (
      await invoke("process", {}, { "x-bp-worker-key": "fixture-worker" })
    ).json();
    assert.equal(result.failed, 1);
    assert.equal(messages.length, 1);
    const first = messages[0];
    assert.equal(first.headers["Idempotency-Key"], "bp-fixture-job");
    assert.match(first.body.html, /&lt;script&gt;/);
    assert(!first.body.html.includes("<script>"));
    const bytes = Buffer.from(first.body.attachments[0].content, "base64");
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    assert(
      calls.some(
        (x) =>
          x.a === "email_result" &&
          x.p.status === "processing" &&
          x.p.snapshot?.attachments,
      ),
      "Snapshot persisted before provider request",
    );
    document.invoice.paid = 2000;
    responseOK = true;
    result = await (
      await invoke("process", {}, { "x-bp-worker-key": "fixture-worker" })
    ).json();
    assert.equal(result.sent, 1);
    assert.deepEqual(
      messages[1],
      first,
      "Retry uses exactly the original subject, HTML, sender and PDF",
    );
    assert(
      calls.some(
        (x) =>
          x.a === "email_result" &&
          x.p.status === "sent" &&
          x.p.provider_id === "provider-fixture",
      ),
    );
  } finally {
    global.fetch = originalFetch;
    delete global.__bpFixture;
    delete global.Deno;
    delete global.EdgeRuntime;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
