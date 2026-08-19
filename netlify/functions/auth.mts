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
