import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  await kv.incr('visitors');
  return res.status(200).json({ ok: true });
}
