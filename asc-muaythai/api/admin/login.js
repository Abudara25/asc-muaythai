// api/admin/login.js
import { checkPassword, createSessionToken, setSessionCookie } from './_auth.js';
import { loadRateLimitState, isLocked, recordFailedLogin, clearLoginAttempts } from './_rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const rateLimit = await loadRateLimitState(req);
  const waitMin = isLocked(rateLimit);
  if (waitMin) return res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${waitMin} min.` });

  const { password } = req.body || {};
  if (!await checkPassword(password)) {
    await recordFailedLogin(rateLimit);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  await clearLoginAttempts(rateLimit);
  setSessionCookie(res, createSessionToken());
  return res.status(200).json({ success: true });
}
