import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config.js";
export const db = createClient(CONFIG.url, CONFIG.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "beauty-plus-owner",
  },
});
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (v) =>
  new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency: "JMD",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export const date = (v) =>
  v
    ? new Intl.DateTimeFormat("en-JM", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Jamaica",
      }).format(new Date(v))
    : "";
export function safeURL(v, images = false) {
  try {
    const u = new URL(v, location.origin);
    return u.protocol === "https:" ||
      u.origin === location.origin ||
      (!images && ["mailto:", "tel:"].includes(u.protocol))
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export async function checked(p) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
export function toast(message, error = false) {
  let el = document.getElementById("bp-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "bp-toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.className = error ? "error" : "";
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => (el.hidden = true), 6500);
}
export function download(name, data, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function csv(rows) {
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
