import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import crypto from 'crypto';

function sha256(str: string) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const hash = await kv.get('admin_hash');
    return res.status(200).json({ isSetup: !!hash });
  }

  if (req.method === 'POST') {
    const { action, passcode } = req.body;
    if (!passcode || String(passcode).length < 4) {
      return res.status(400).json({ ok: false, error: 'Passcode too short' });
    }

    if (action === 'setup') {
      const existing = await kv.get('admin_hash');
      if (existing) return res.status(400).json({ ok: false, error: 'Already set up' });
      await kv.set('admin_hash', sha256(passcode));
      return res.status(200).json({ ok: true });
    }

    if (action === 'verify') {
      const hash = await kv.get('admin_hash');
      const ok = hash && hash === sha256(passcode);
      return res.status(ok ? 200 : 401).json({ ok: !!ok });
    }
  }

  return res.status(400).send('Bad request');
}
