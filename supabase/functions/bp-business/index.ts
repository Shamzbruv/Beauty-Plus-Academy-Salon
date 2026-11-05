import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
import {
  emailHTML,
  fillTemplate,
  invoiceNumber,
} from "../_shared/documents.js";
import { invoicePDF } from "./pdf.ts";
const origin = "https://beautyplusacademyandsalon.com";
const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-bp-worker-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
async function server(action: string, p: any = {}) {
  const { data, error } = await service.rpc("bp_server_command", {
    p_action: action,
    p,
  });
  if (error) throw new Error(error.message);
  return data;
}
const json = (d: any, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const encode = (bytes: Uint8Array) => {
  let s = "";
  for (let k = 0; k < bytes.length; k += 8192)
    s += String.fromCharCode(...bytes.subarray(k, k + 8192));
  return btoa(s);
};
async function runWorker() {
  const config = await server("config");
  let sent = 0,
    failed = 0;
  for (const job of await server("claim_emails")) {
    try {
      if (!config.resend_api_key) {
        await server("email_result", {
          id: job.id,
          status: "blocked",
          error:
            "Connect the email provider in Studio → Emails to send this invoice.",
        });
        continue;
      }
      const payload = await server("email_data", { id: job.id });
      if (!payload?.document || !payload.template?.enabled) {
        await server("email_result", {
          id: job.id,
          status: "skipped",
          error: "Template disabled or invoice unavailable.",
        });
        continue;
      }
      const doc = payload.document,
        settings = doc.branding || {},
        recipient = payload.recipient;
      const existing = job.snapshot;
      const snapshot = existing || {
        subject: fillTemplate(payload.template.subject, doc),
        html: emailHTML(
          doc,
          payload.template,
          origin + "/invoice.html?token=" + String(payload.access_token),
        ),
        from: `${String(settings.email_from_name || doc.business.name).replace(/[<>\r\n]/g, "")} <${settings.email_from || doc.business.email}>`,
        reply_to: settings.email_reply_to || doc.business.email,
      };
      if (!snapshot.attachments) {
        const pdf = await invoicePDF(doc);
        snapshot.attachments = [
          {
            filename: invoiceNumber(doc.invoice) + ".pdf",
            content: encode(pdf),
          },
        ];
      }
      await server("email_result", {
        id: job.id,
        status: "processing",
        snapshot,
      });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.resend_api_key,
          "Content-Type": "application/json",
          "Idempotency-Key": "bp-" + job.id,
        },
        body: JSON.stringify({ ...snapshot, to: [recipient] }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "Email provider rejected this message.",
        );
      await server("email_result", {
        id: job.id,
        status: "sent",
        provider_id: result.id,
        snapshot,
      });
      sent++;
    } catch (err) {
      await server("email_result", {
        id: job.id,
        status: "failed",
        error: err.message,
      });
      failed++;
    }
  }
  const pub = Deno.env.get("BP_VAPID_PUBLIC"),
    priv = Deno.env.get("BP_VAPID_PRIVATE");
  if (pub && priv) {
    webpush.setVapidDetails("mailto:icreatesolutions.ja@gmail.com", pub, priv);
    for (const job of await server("claim_push")) {
      try {
        await webpush.sendNotification(
          job.subscription,
          JSON.stringify({
            title: job.title,
            body: job.body,
            url: "/admin/index.html#notifications",
            tag: "bp-" + job.id,
          }),
          { TTL: 3600 },
        );
        await server("push_result", { id: job.id, status: "sent" });
      } catch (err) {
        await server("push_result", {
          id: job.id,
          subscription_id: job.subscription_id,
          status:
            err.statusCode === 404 || err.statusCode === 410
              ? "expired"
              : "failed",
          error: err.message,
        });
      }
    }
  }
  return { sent, failed };
}
let bootstrapped = false;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    if (!bootstrapped) {
      await server("bootstrap", { gateway: Deno.env.get("SUPABASE_ANON_KEY") });
      bootstrapped = true;
    }
    const body = await req.json(),
      action = body.action,
      p = body.data || {};
    if (action === "process") {
      const key = req.headers.get("x-bp-worker-key");
      if (!key || key !== Deno.env.get("BP_WORKER_KEY"))
        return json({ error: "Unauthorized" }, 401);
      return json(await runWorker());
    }
    if (action === "invoice_pdf") {
      const doc = await server("document", { token: p.token });
      if (!doc) return json({ error: "Invoice not found" }, 404);
      const bytes = await invoicePDF(doc);
      return json({
        filename: invoiceNumber(doc.invoice) + ".pdf",
        content: encode(bytes),
      });
    }
    const token = (req.headers.get("Authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    const {
      data: { user },
      error,
    } = await service.auth.getUser(token);
    if (error || !user) return json({ error: "Sign in to your studio." }, 401);
    const actor = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: "Bearer " + token } },
        auth: { persistSession: false },
      },
    );
    const { data: context, error: contextError } =
      await actor.rpc("bp_access_context");
    if (contextError) throw new Error(contextError.message);
    if (action === "self_password") {
      if (!context.is_admin && (!context.staff?.active || !context.has_session))
        return json({ error: "Active account required" }, 403);
      if (typeof p.password !== "string" || p.password.length < 12)
        throw new Error("Use at least 12 characters.");
      const { error } = await service.auth.admin.updateUserById(user.id, {
        password: p.password,
      });
      if (error) throw error;
      if (context.staff)
        await server("staff_password_changed", { user_id: user.id });
      return json({ ok: true });
    }
    if (action === "push_config") {
      if (!context.is_admin && !context.can_pos && !context.can_book)
        return json({ error: "Active account required" }, 403);
      return json({ publicKey: Deno.env.get("BP_VAPID_PUBLIC") || "" });
    }
    if (!context.is_admin) return json({ error: "Owner access required" }, 403);
    if (action === "staff_save") {
      if (!p.name || !p.email)
        throw new Error("Enter the employee name and email.");
      let id = p.user_id;
      if (id) {
        const staff = await server("staff_get", { user_id: id });
        if (!staff) throw new Error("Employee not found.");
        p.email = staff.email;
        if (p.password) {
          if (p.password.length < 12)
            throw new Error("Use at least 12 characters.");
          const { error } = await service.auth.admin.updateUserById(id, {
            password: p.password,
          });
          if (error) throw error;
          p.force_password_change = true;
          p.revoke_sessions = true;
        }
      } else {
        if (!p.password || p.password.length < 12)
          throw new Error(
            "Choose a temporary password with at least 12 characters.",
          );
        const { data, error } = await service.auth.admin.createUser({
          email: p.email,
          password: p.password,
          email_confirm: true,
        });
        if (error) throw error;
        id = data.user.id;
        p.force_password_change = true;
      }
      try {
        return json(
          await server("staff_save", { ...p, user_id: id, actor: user.id }),
        );
      } catch (err) {
        if (!p.user_id) await service.auth.admin.deleteUser(id);
        throw err;
      }
    }
    if (action === "email_status") {
      const c = await server("config");
      return json({ configured: !!c.resend_api_key, provider: "Resend" });
    }
    if (action === "email_config") {
      if (
        typeof p.api_key !== "string" ||
        !/^re_[A-Za-z0-9_-]{10,}$/.test(p.api_key)
      )
        throw new Error("Enter a valid Resend API key.");
      await server("config_set", { resend_api_key: p.api_key });
      EdgeRuntime.waitUntil(runWorker());
      return json({ ok: true });
    }
    if (action === "email_preview") {
      const data = await server("template_data", { template: p.template });
      const t = data.template,
        business = { data: data.business },
        brand = { data: data.branding };
      const doc = p.document || {
        invoice: {
          number: 123,
          customer_name: "Your customer",
          total: 6500,
          paid: 0,
          source_kind: "booking",
          created_at: new Date().toISOString(),
          status: "unpaid",
          items: [],
        },
        business: business?.data,
        branding: brand?.data,
        request: {
          date: "Your appointment date",
          time: "10:00",
          status: "Request received",
        },
      };
      return json({
        html: emailHTML(doc, t, origin + "/"),
        subject: fillTemplate(t.subject, doc),
      });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("Business action failed:", err.name);
    return json({ error: err.message || "Please try again." }, 400);
  }
});
