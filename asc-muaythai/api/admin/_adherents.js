// api/admin/_adherents.js
// Schéma et accès partagés au registre des adhérents, stocké en un seul
// fichier JSON sur Vercel Blob. Contient des données personnelles sensibles
// (noms, coordonnées, liens vers justificatifs médicaux/pièces d'identité) :
// à la différence de content.json (contenu public du site), ce blob est
// nommé à partir d'ADMIN_SESSION_SECRET pour rester impossible à deviner,
// comme le fichier d'authentification admin.
import { put, del } from '@vercel/blob';
import { secretPathname } from './_auth.js';

const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';
export const ADHERENTS_PATHNAME = secretPathname('adherents');

export const STATUTS_PAIEMENT = ['en_attente_paiement', 'a_percevoir', 'paye'];

export async function getAdherents() {
  try {
    // Query-string aléatoire : le CDN devant le stockage Blob met en cache par URL
    // exacte, donc une URL fixe peut renvoyer une copie d'edge pas encore invalidée
    // juste après une écriture (constaté en pratique : des écritures rapprochées,
    // même sous verrou — voir withAdherentsLock — se sont déjà perdues comme ça).
    // Une URL différente à chaque appel force un vrai passage par l'origine.
    const bust = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetch(`${BLOB_BASE}/${ADHERENTS_PATHNAME}?v=${bust}`, { cache: 'no-store' });
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

// Verrou distribué (via Vercel Blob) autour du cycle lecture-modification-écriture
// du blob adhérents : deux requêtes concurrentes (admin + webhook HelloAsso, ou
// deux admins) peuvent sinon lire la même liste, la modifier séparément, puis
// s'écraser l'une l'autre (dernier « saveAdherents » gagnant = adhérents perdus).
// Vercel Blob n'a pas d'écriture conditionnelle ; on simule un verrou avec
// `allowOverwrite: false`, qui échoue si le blob de verrou existe déjà.
const LOCK_PATHNAME = secretPathname('adherents-lock');
const LOCK_STALE_MS = 15000; // au-delà, on considère le verrou abandonné (fonction précédente plantée avant de le libérer)
const LOCK_MAX_WAIT_MS = 8000;

async function tryAcquireLock(token) {
  try {
    await put(LOCK_PATHNAME, token, {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 0,
    });
    return true;
  } catch {
    return false;
  }
}

async function forceLockIfStale(token) {
  try {
    const res = await fetch(`${BLOB_BASE}/${LOCK_PATHNAME}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const held = await res.text();
    const heldAt = Number(held.split(':')[0]);
    if (!Number.isFinite(heldAt) || Date.now() - heldAt < LOCK_STALE_MS) return false;
    await put(LOCK_PATHNAME, token, {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    return true;
  } catch {
    return false;
  }
}

async function acquireAdherentsLock() {
  const token = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const start = Date.now();
  while (Date.now() - start < LOCK_MAX_WAIT_MS) {
    if (await tryAcquireLock(token)) return token;
    if (await forceLockIfStale(token)) return token;
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
  }
  throw new Error('Modification concurrente en cours, réessaie dans un instant.');
}

async function releaseAdherentsLock() {
  try {
    await del(`${BLOB_BASE}/${LOCK_PATHNAME}`);
  } catch {
    // Le verrou expirera de lui-même (voir LOCK_STALE_MS) si la suppression échoue.
  }
}

// À utiliser autour de tout cycle getAdherents() → mutation → saveAdherents() :
// await withAdherentsLock(async () => { const list = await getAdherents(); ...; await saveAdherents(list); return ...; });
export async function withAdherentsLock(fn) {
  await acquireAdherentsLock();
  try {
    return await fn();
  } finally {
    await releaseAdherentsLock();
  }
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
    docAttestationUrl: a.docAttestationUrl || '',
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
