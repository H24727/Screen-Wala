import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import crypto from 'crypto';

function sha256(str: string) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const passcode = (req.headers['x-passcode'] as string) || '';
  const hash = await kv.get('admin_hash');

  if (!hash || hash !== sha256(passcode)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const visitors = (await kv.get<number>('visitors')) || 0;
  const orders: any[] = (await kv.get('orders')) || [];

  const totalRevenue = orders.reduce((s, o) => s + (o.price || 0), 0);
  const totalCost = orders.reduce((s, o) => s + (o.cost || 0), 0);
  const totalProfit = orders.reduce((s, o) => s + (o.profit || 0), 0);

  return res.status(200).json({
    ok: true,
    visitors,
    orderCount: orders.length,
    totalRevenue, totalCost, totalProfit,
    orders: orders.slice().reverse(),
  });
}
