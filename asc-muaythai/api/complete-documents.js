// api/complete-documents.js
// Endpoint public (aucune authentification admin) associé à /completer-dossier :
// un adhérent qui a reçu un lien de relance (avec un jeton imprévisible généré
// par l'admin, voir api/admin/save-content.js action "send-doc-link") vient
// déposer ici le ou les documents qui manquaient à son dossier. Le fichier lui-
// même est envoyé séparément via api/upload-document.js (déjà public) ; cet
// endpoint ne fait que rattacher l'URL renvoyée à la bonne fiche adhérent,
// après vérification du jeton.
import { getAdherents, saveAdherents, missingDocTypes, DOC_TYPE_FIELD, withAdherentsLock } from './admin/_adherents.js';
import { loadRateLimitState, isLocked, recordFailedLogin } from './admin/_rateLimit.js';

const BLOB_DOC_PREFIX = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com/justificatifs/';
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;

function findByToken(list, token) {
  return token ? list.find((a) => a.docsToken && a.docsToken === token) : null;
}

export default async function handler(req, res) {
  const rateLimit = await loadRateLimitState(req, 'complete-documents');
  const waitMin = isLocked(rateLimit, MAX_ATTEMPTS);
  if (waitMin) return res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${waitMin} min.` });

  if (req.method === 'GET') {
    const { token } = req.query;
    const list = await getAdherents();
    const adherent = findByToken(list, token);
    if (!adherent) {
      await recordFailedLogin(rateLimit, WINDOW_MS);
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }
    return res.status(200).json({ prenom: adherent.prenom, missing: missingDocTypes(adherent) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token, docType, url } = req.body || {};
  const field = DOC_TYPE_FIELD[docType];
  if (!field) return res.status(400).json({ error: 'Type de document invalide' });
  if (typeof url !== 'string' || !url.startsWith(BLOB_DOC_PREFIX)) {
    return res.status(400).json({ error: 'Fichier invalide' });
  }

  let outcome;
  await withAdherentsLock(async () => {
    const list = await getAdherents();
    const adherent = findByToken(list, token);
    if (!adherent) { outcome = { error: 'notfound' }; return; }
    // On ne comble que les trous : jamais remplacer un document déjà fourni via
    // ce canal, même si un visiteur malveillant récupérait ce jeton par ailleurs.
    if (adherent[field]) { outcome = { error: 'already' }; return; }

    adherent[field] = url;
    const stillMissing = missingDocTypes(adherent);
    if (!stillMissing.length) adherent.docsToken = ''; // dossier complet : le lien ne sert plus à rien
    await saveAdherents(list);
    outcome = { missing: stillMissing };
  });

  if (outcome.error === 'notfound') {
    await recordFailedLogin(rateLimit, WINDOW_MS);
    return res.status(404).json({ error: 'Lien invalide ou expiré' });
  }
  if (outcome.error === 'already') return res.status(400).json({ error: 'Ce document a déjà été fourni' });

  return res.status(200).json({ success: true, missing: outcome.missing });
}
