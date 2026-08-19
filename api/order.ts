import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const { planId, planName, planTag, duration, name, phone, email, city, payMethod, txnId, orderNumber } = req.body;

    const entry = PRICES[planId]?.[duration];
    if (!entry) {
      return res.status(400).json({ ok: false, error: 'Invalid plan/duration' });
    }

    const order = {
      id: 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      orderNumber, planName, planTag, duration,
      price: entry.price, cost: entry.cost, profit: entry.price - entry.cost,
      name: String(name || '').slice(0, 60),
      phone: String(phone || '').slice(0, 20),
      email: String(email || '').slice(0, 80),
      city: String(city || '').slice(0, 40),
      payMethod: String(payMethod || '').slice(0, 30),
      txnId: String(txnId || '').slice(0, 40),
      createdAt: new Date().toISOString(),
    };

    const orders: any[] = (await kv.get('orders')) || [];
    orders.push(order);
    await kv.set('orders', orders);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
