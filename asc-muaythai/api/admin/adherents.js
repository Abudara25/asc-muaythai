// api/admin/adherents.js
// CRUD admin sur le registre des adhérents. Toute requête doit être
// authentifiée (session admin) : ce fichier ne gère jamais l'écriture faite
// depuis le formulaire public (voir api/inscription.js) ni depuis le webhook
// HelloAsso, qui écrivent directement via _adherents.js.
import { del } from '@vercel/blob';
import { requireAuth } from './_auth.js';
import { getAdherents, saveAdherents, isValidAdherent, withDefaults } from './_adherents.js';

const DOC_URL_FIELDS = ['docCertificatUrl', 'docPhotoUrl', 'docIdentiteUrl', 'docAutorisationUrl'];

// Purge effective des justificatifs (droit à l'effacement) : supprimer le seul
// enregistrement JSON ne suffit pas, les fichiers doivent disparaître aussi.
async function deleteAdherentDocs(adherent) {
  const urls = DOC_URL_FIELDS.map((f) => adherent[f]).filter(Boolean);
  await Promise.all(urls.map((url) => del(url).catch((e) => {
    console.error('Suppression justificatif ERREUR:', url, e.message);
  })));
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const list = await getAdherents();
    // Plus récent d'abord.
    list.sort((a, b) => (b.dateInscription || '').localeCompare(a.dateInscription || ''));
    return res.status(200).json(list);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { action } = req.body || {};

  if (action === 'save') {
    const incoming = req.body.adherent;
    if (!isValidAdherent(incoming)) {
      return res.status(400).json({ error: 'Adhérent invalide : nom, prénom et email requis' });
    }
    const adherent = withDefaults(incoming);
    const list = await getAdherents();
    const idx = list.findIndex((a) => a.id === adherent.id);
    if (idx >= 0) {
      // Un justificatif remplacé (nouvel upload sur un champ qui en avait déjà
      // un) ne doit pas laisser l'ancien fichier orphelin sur le stockage.
      const previous = list[idx];
      const toRemove = DOC_URL_FIELDS
        .map((f) => previous[f])
        .filter((oldUrl, i) => oldUrl && oldUrl !== adherent[DOC_URL_FIELDS[i]]);
      if (toRemove.length) {
        await Promise.all(toRemove.map((url) => del(url).catch((e) => {
          console.error('Suppression ancien justificatif ERREUR:', url, e.message);
        })));
      }
      list[idx] = adherent;
    } else {
      list.push(adherent);
    }
    await saveAdherents(list);
    return res.status(200).json({ success: true, adherent });
  }

  if (action === 'delete') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id requis' });
    const list = await getAdherents();
    const toDelete = list.find((a) => a.id === id);
    if (toDelete) await deleteAdherentDocs(toDelete);
    await saveAdherents(list.filter((a) => a.id !== id));
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'action inconnue' });
}
