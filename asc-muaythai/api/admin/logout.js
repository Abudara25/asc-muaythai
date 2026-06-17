// api/admin/logout.js
import { clearSessionCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}
