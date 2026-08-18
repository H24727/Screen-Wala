========================================================
SCREENWALA â€” GITHUB + NETLIFY SETUP GUIDE
========================================================

WHY: Netlify's "Deploy manually" (drag-and-drop) doesn't run
"npm install", so the backend package (@netlify/blobs) never
loads and the admin dashboard fails. Connecting through GitHub
fixes this permanently â€” Netlify auto-installs everything.

--------------------------------------------------------
STEP 1 â€” Create GitHub account & repository
--------------------------------------------------------
1. Go to github.com, sign up (free) if you don't have an account
2. Click "New repository"
3. Name it: screenwala-site
4. Set it to Public
5. Click "Create repository"

--------------------------------------------------------
STEP 2 â€” Upload the two big files
--------------------------------------------------------
1. On the repo page: "Add file" -> "Upload files"
2. Select BOTH index.html and admin.html from your downloads
3. Click "Commit changes"

--------------------------------------------------------
STEP 3 â€” Create the 4 backend files
--------------------------------------------------------
For each file below:
1. Click "Add file" -> "Create new file"
2. In the "Name your file..." box, type the FULL PATH shown
   (GitHub will auto-create the folders for you)
3. Copy-paste the content into the big text box below it
4. Scroll down, click "Commit changes"
5. Go back to the repo home and repeat for the next file

--------------------------------------------------------
FILE PATH: netlify/functions/auth.mts
--------------------------------------------------------
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

--------------------------------------------------------
FILE PATH: netlify/functions/track.mts
--------------------------------------------------------
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

--------------------------------------------------------
FILE PATH: netlify/functions/order.mts
--------------------------------------------------------
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

--------------------------------------------------------
FILE PATH: netlify/functions/stats.mts
--------------------------------------------------------
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

--------------------------------------------------------
FILE PATH: netlify.toml
--------------------------------------------------------
[build]
  publish = "."
  functions = "netlify/functions"

# Without this, calls to /api/... never reach the functions folder â€”
# Netlify serves functions at /.netlify/functions/<name> by default.
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

--------------------------------------------------------
FILE PATH: package.json
--------------------------------------------------------
{
  "name": "screenwala",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@netlify/blobs": "^8.1.0"
  }
}

--------------------------------------------------------
STEP 4 â€” Connect Netlify to this GitHub repo
--------------------------------------------------------
1. Go to app.netlify.com
2. Click "Add new site" -> "Import an existing project"
3. Choose "Deploy with GitHub"
4. Authorize Netlify to access GitHub if asked
5. Select the "screenwala-site" repository
6. Leave all build settings as default (blank build command is fine)
7. Click "Deploy"
8. Wait ~1-2 minutes for the first deploy to finish

--------------------------------------------------------
STEP 5 â€” Set your admin password
--------------------------------------------------------
1. Open yoursite.netlify.app/admin.html
2. This time it should work â€” set your password there

--------------------------------------------------------
FROM NOW ON: any future updates
--------------------------------------------------------
Just re-upload the changed file(s) on GitHub (Add file ->
Upload files, or edit the file directly on GitHub) and
Netlify will automatically redeploy within a minute.
No more manual drag-and-drop needed ever again.
