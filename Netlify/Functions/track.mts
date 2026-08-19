import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Public endpoint — just bumps the visitor counter. No sensitive data in or out.
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const store = getStore("screenwala-data");
  let n = parseInt((await store.get("visitors")) || "0");
  if (isNaN(n)) n = 0;
  await store.set("visitors", String(n + 1));
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
