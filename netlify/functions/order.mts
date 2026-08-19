import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Server-side price/cost table. NEVER trust price/cost sent by the client —
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
