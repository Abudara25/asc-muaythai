// api/admin/reset-password.js
import { del } from '@vercel/blob';
import { timingSafeEqual } from 'crypto';
import { storePassword } from './_auth.js';

const TOKEN_PATHNAME = 'reset-token.json';
const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token, newPassword } = req.body || {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Lien invalide ou expiré' });
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  }

  let stored;
  try {
    const r = await fetch(`${BLOB_BASE}/${TOKEN_PATHNAME}`, { cache: 'no-store' });
    if (!r.ok) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    stored = await r.json();
  } catch {
    return res.status(400).json({ error: 'Lien invalide ou expiré' });
  }

  if (!stored.token || !stored.expiresAt || Date.now() > stored.expiresAt) {
    return res.status(400).json({ error: 'Ce lien a expiré. Fais une nouvelle demande.' });
  }

  const a = Buffer.from(token);
  const b = Buffer.from(stored.token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' });
  }

  await storePassword(newPassword);
  await del(`${BLOB_BASE}/${TOKEN_PATHNAME}`).catch(() => {});
  return res.status(200).json({ success: true });
}
