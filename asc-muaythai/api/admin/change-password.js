// api/admin/change-password.js
import { requireAuth, checkPassword, storePassword } from './_auth.js';
import { loadRateLimitState, isLocked, recordFailedLogin, clearLoginAttempts } from './_rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!requireAuth(req, res)) return;

  const rateLimit = await loadRateLimitState(req);
  const waitMin = isLocked(rateLimit);
  if (waitMin) return res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${waitMin} min.` });

  const { currentPassword, newPassword } = req.body || {};

  if (!await checkPassword(currentPassword)) {
    await recordFailedLogin(rateLimit);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  }

  await clearLoginAttempts(rateLimit);
  await storePassword(newPassword);
  return res.status(200).json({ success: true });
}
