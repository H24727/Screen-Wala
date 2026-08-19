import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

async function sha256(str: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default async (req: Request, context: Context) => {
  const store = getStore("screenwala-data");

  if (req.method === "GET") {
    const hash = await store.get("admin_hash");
    return new Response(JSON.stringify({ isSetup: !!hash }), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "POST") {
    const { action, passcode } = await req.json();
    if (!passcode || String(passcode).length < 4) {
      return new Response(JSON.stringify({ ok: false, error: "Passcode too short" }), { status: 400 });
    }

    if (action === "setup") {
      const existing = await store.get("admin_hash");
      if (existing) return new Response(JSON.stringify({ ok: false, error: "Already set up" }), { status: 400 });
      await store.set("admin_hash", await sha256(passcode));
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (action === "verify") {
      const hash = await store.get("admin_hash");
      const ok = hash && hash === (await sha256(passcode));
      return new Response(JSON.stringify({ ok: !!ok }), { status: ok ? 200 : 401, headers: { "Content-Type": "application/json" } });
    }
  }

  return new Response("Bad request", { status: 400 });
};

import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Public endpoint â€” just bumps the visitor counter. No sensitive data in or out.
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const store = getStore("screenwala-data");
  let n = parseInt((await store.get("visitors")) || "0");
  if (isNaN(n)) n = 0;
  await store.set("visitors", String(n + 1));
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Server-side price/cost table. NEVER trust price/cost sent by the client â€”
// a customer could tamper with it in devtools. Duration + planId are enough;
// the real numbers always come from here.
const PRICES: Record<string, Record<string, { price: number; cost: number }>> = {
  business: {
    "1 Month": { price: 450, cost: 240 },
    "3 Month": { price: 1260, cost: 720 },
    "6 Month": { price: 2520, cost: 1440 },
    "12 Month": { price: 5040, cost: 2880 },
  },
  international: {
    "1 Month": { price: 570, cost: 240 },
    "3 Month": { price: 1596, cost: 720 },
    "6 Month": { price: 3192, cost: 1440 },
    "12 Month": { price: 6384, cost: 2880 },
  },
};

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await req.json();
    const { planId, planName, planTag, duration, name, phone, email, city, payMethod, txnId, orderNumber } = body;

    const entry = PRICES[planId]?.[duration];
    if (!entry) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid plan/duration" }), { status: 400 });
    }

    const order = {
      id: "ord_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      orderNumber, planName, planTag, duration,
      price: entry.price, cost: entry.cost, profit: entry.price - entry.cost,
      name: String(name || "").slice(0, 60),
      phone: String(phone || "").slice(0, 20),
      email: String(email || "").slice(0, 80),
      city: String(city || "").slice(0, 40),
      payMethod: String(payMethod || "").slice(0, 30),
      txnId: String(txnId || "").slice(0, 40),
      createdAt: new Date().toISOString(),
    };

    const store = getStore("screenwala-data");
    const raw = await store.get("orders");
    const orders = raw ? JSON.parse(raw) : [];
    orders.push(order);
    await store.set("orders", JSON.stringify(orders));

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), { status: 500 });
  }
};

import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

async function sha256(str: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default async (req: Request, context: Context) => {
  const store = getStore("screenwala-data");
  const passcode = req.headers.get("x-passcode") || "";
  const hash = await store.get("admin_hash");

  if (!hash || hash !== (await sha256(passcode))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const visitors = parseInt((await store.get("visitors")) || "0") || 0;
  const raw = await store.get("orders");
  const orders = raw ? JSON.parse(raw) : [];

  const totalRevenue = orders.reduce((s: number, o: any) => s + (o.price || 0), 0);
  const totalCost = orders.reduce((s: number, o: any) => s + (o.cost || 0), 0);
  const totalProfit = orders.reduce((s: number, o: any) => s + (o.profit || 0), 0);

  return new Response(JSON.stringify({
    ok: true,
    visitors,
    orderCount: orders.length,
    totalRevenue, totalCost, totalProfit,
    orders: orders.slice().reverse(), // newest first
  }), { headers: { "Content-Type": "application/json" } });
};

[build]
  publish = "."
  functions = "netlify/functions"

# Without this, calls to /api/... never reach the functions folder â€”
# Netlify serves functions at /.netlify/functions/<name> by default.
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200


{
  "name": "screenwala",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@netlify/blobs": "^8.1.0"
  }
}
