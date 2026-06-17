// api/admin/session.js
// Permet à la page /admin de savoir si une session valide existe déjà
// (évite de redemander le mot de passe à chaque rechargement, pendant 12h).
import { isAuthenticated } from './_auth.js';

export default async function handler(req, res) {
  return res.status(200).json({ authenticated: isAuthenticated(req) });
}
