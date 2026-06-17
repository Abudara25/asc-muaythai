// api/admin/login.js
import { checkPassword, createSessionToken, setSessionCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { password } = req.body || {};
  if (!await checkPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  setSessionCookie(res, createSessionToken());
  return res.status(200).json({ success: true });
}
