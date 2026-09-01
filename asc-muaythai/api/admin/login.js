// api/admin/login.js
// Regroupe connexion, déconnexion et vérification de session dans un seul
// fichier : le forfait Vercel Hobby plafonne à 12 fonctions serverless par
// déploiement, et chaque fichier sous api/ (hors préfixe "_") en compte une.
// /api/admin/logout et /api/admin/session pointent ici via des rewrites dans
// vercel.json — la page /admin continue d'appeler ces URLs sans changement.
import { checkPassword, createSessionToken, setSessionCookie, clearSessionCookie, isAuthenticated } from './_auth.js';
import { loadRateLimitState, isLocked, recordFailedLogin, clearLoginAttempts } from './_rateLimit.js';

export default async function handler(req, res) {
  // GET (depuis /api/admin/session) : la page /admin sait si une session
  // valide existe déjà, sans redemander le mot de passe à chaque rechargement.
  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: isAuthenticated(req) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // POST (depuis /api/admin/logout) : ?action=logout dans le rewrite.
  if (req.query.action === 'logout') {
    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  }

  // POST (depuis /api/admin/login) : connexion.
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
