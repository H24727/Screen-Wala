import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { Redis } from "@upstash/redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

// ---------- AUTH ----------
app.get("/api/auth", async (req, res) => {
  const hash = await redis.get("admin_hash");
  res.json({ isSetup: !!hash });
});

app.post("/api/auth", async (req, res) => {
  const { action, passcode } = req.body || {};
  if (!passcode || String(passcode).length < 4) {
    return res.status(400).json({ ok: false, error: "Passcode too short" });
  }

  if (action === "setup") {
    const existing = await redis.get("admin_hash");
    if (existing) return res.status(400).json({ ok: false, error: "Already set up" });
    await redis.set("admin_hash", sha256(passcode));
    return res.json({ ok: true });
  }

  if (action === "verify") {
    const hash = await redis.get("admin_hash");
    const ok = hash && hash === sha256(passcode);
    return res.status(ok ? 200 : 401).json({ ok: !!ok });
  }

  res.status(400).send("Bad request");
});

// ---------- TRACK ----------
app.post("/api/track", async (req, res) => {
  await redis.incr("visitors");
  res.json({ ok: true });
});

// ---------- ORDER ----------
const PRICES = {
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

app.post("/api/order", async (req, res) => {
  try {
    const { planId, planName, planTag, duration, name, phone, email, city, payMethod, txnId, orderNumber } = req.body || {};

    const entry = PRICES[planId]?.[duration];
    if (!entry) {
      return res.status(400).json({ ok: false, error: "Invalid plan/duration" });
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

    const orders = (await redis.get("orders")) || [];
    orders.push(order);
    await redis.set("orders", orders);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ---------- STATS ----------
app.get("/api/stats", async (req, res) => {
  const passcode = req.headers["x-passcode"] || "";
  const hash = await redis.get("admin_hash");

  if (!hash || hash !== sha256(passcode)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const visitors = (await redis.get("visitors")) || 0;
  const orders = (await redis.get("orders")) || [];

  const totalRevenue = orders.reduce((s, o) => s + (o.price || 0), 0);
  const totalCost = orders.reduce((s, o) => s + (o.cost || 0), 0);
  const totalProfit = orders.reduce((s, o) => s + (o.profit || 0), 0);

  res.json({
    ok: true,
    visitors,
    orderCount: orders.length,
    totalRevenue, totalCost, totalProfit,
    orders: orders.slice().reverse(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
