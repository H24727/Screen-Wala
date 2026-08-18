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
