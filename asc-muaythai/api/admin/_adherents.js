// api/admin/_adherents.js
// Schéma et accès partagés au registre des adhérents, stocké en un seul
// fichier JSON sur Vercel Blob. Contient des données personnelles sensibles
// (noms, coordonnées, liens vers justificatifs médicaux/pièces d'identité) :
// à la différence de content.json (contenu public du site), ce blob est
// nommé à partir d'ADMIN_SESSION_SECRET pour rester impossible à deviner,
// comme le fichier d'authentification admin.
import { put } from '@vercel/blob';
import { secretPathname } from './_auth.js';

const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';
export const ADHERENTS_PATHNAME = secretPathname('adherents');

export const STATUTS_PAIEMENT = ['en_attente_paiement', 'a_percevoir', 'paye'];

export async function getAdherents() {
  try {
    const res = await fetch(`${BLOB_BASE}/${ADHERENTS_PATHNAME}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveAdherents(list) {
  return put(ADHERENTS_PATHNAME, JSON.stringify(list, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

function isString(v) { return typeof v === 'string'; }

export function isValidAdherent(a) {
  return (
    a && typeof a === 'object' &&
    isString(a.nom) && a.nom.trim().length > 0 &&
    isString(a.prenom) && a.prenom.trim().length > 0 &&
    isString(a.email)
  );
}

export function newAdherentId() {
  return `adh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Gabarit par défaut : tout champ non fourni à la création reste défini pour
// que la liste admin et le tri par statut restent prévisibles.
export function withDefaults(a) {
  return {
    id: a.id || newAdherentId(),
    nom: a.nom || '',
    prenom: a.prenom || '',
    email: a.email || '',
    telephone: a.telephone || '',
    section: a.section || '',
    montant: typeof a.montant === 'number' ? a.montant : null,
    reglement: a.reglement || '',
    hasPassSport: !!a.hasPassSport,
    statutPaiement: STATUTS_PAIEMENT.includes(a.statutPaiement) ? a.statutPaiement : 'en_attente_paiement',
    docCertificatUrl: a.docCertificatUrl || '',
    docPhotoUrl: a.docPhotoUrl || '',
    docIdentiteUrl: a.docIdentiteUrl || '',
    docAutorisationUrl: a.docAutorisationUrl || '',
    docsToken: a.docsToken || '',
    docsRelanceEnvoyeeLe: a.docsRelanceEnvoyeeLe || '',
    renewalToken: a.renewalToken || '',
    saison: a.saison || '',
    dateInscription: a.dateInscription || new Date().toISOString().slice(0, 10),
    datePaiement: a.datePaiement || '',
    source: a.source || 'formulaire',
    notes: a.notes || '',
  };
}

// Un mineur (section Enfants/Ados) doit fournir l'autorisation parentale ; un
// adulte non. La pièce d'identité n'est jamais rendue obligatoire côté
// formulaire d'inscription, donc c'est le document qui manque le plus souvent.
export const DOC_TYPE_FIELD = {
  certificat: 'docCertificatUrl',
  photo: 'docPhotoUrl',
  identite: 'docIdentiteUrl',
  autorisation: 'docAutorisationUrl',
};
export const DOC_TYPE_LABELS = {
  certificat: 'Certificat médical',
  photo: "Photo d'identité",
  identite: "Pièce d'identité",
  autorisation: 'Autorisation parentale',
};

export function isMinorAdherent(adherent) {
  return typeof adherent.section === 'string' && (adherent.section.includes('Enfants') || adherent.section.includes('Ados'));
}

export function missingDocTypes(adherent) {
  const types = ['certificat', 'photo', 'identite'];
  if (isMinorAdherent(adherent)) types.push('autorisation');
  return types.filter((t) => !adherent[DOC_TYPE_FIELD[t]]);
}
