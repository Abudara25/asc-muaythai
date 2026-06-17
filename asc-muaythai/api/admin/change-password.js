// api/admin/change-password.js
import { requireAuth, checkPassword, storePassword } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  const { currentPassword, newPassword } = req.body || {};

  if (!await checkPassword(currentPassword)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  }

  await storePassword(newPassword);
  return res.status(200).json({ success: true });
}
