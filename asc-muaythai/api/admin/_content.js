// api/admin/_content.js
// Schéma et constantes partagées pour le contenu éditable du site,
// stocké en un seul fichier JSON sur Vercel Blob.
export const CONTENT_PATHNAME = 'content.json';

const isString = (v) => typeof v === 'string';
const isNonEmptyString = (v) => isString(v) && v.trim().length > 0;
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isStringArray = (v) => Array.isArray(v) && v.every(isString);

function isValidContact(c) {
  return (
    c && typeof c === 'object' &&
    isNonEmptyString(c.email) &&
    isNonEmptyString(c.telephone) &&
    isNonEmptyString(c.adresseEntrainement)
  );
}

function isValidCreneau(c) {
  return (
    c && typeof c === 'object' &&
    isNonEmptyString(c.jour) &&
    isNonEmptyString(c.horaire) &&
    isNonEmptyString(c.groupe) &&
    ['enfants', 'ados', 'adultes', 'competition'].includes(c.categorie)
  );
}

function isValidTarif(t) {
  return (
    t && typeof t === 'object' &&
    isNonEmptyString(t.section) &&
    isFiniteNumber(t.prix) &&
    isStringArray(t.avantages)
  );
}

function isValidTrophee(t) {
  return (
    t && typeof t === 'object' &&
    isNonEmptyString(t.nombre) &&
    isNonEmptyString(t.titre) &&
    isString(t.sousTitre)
  );
}

function isValidPalmares(p) {
  return (
    p && typeof p === 'object' &&
    isNonEmptyString(p.saison) &&
    Array.isArray(p.trophees) && p.trophees.every(isValidTrophee) &&
    isStringArray(p.photos)
  );
}

function isValidPartenaire(p) {
  return (
    p && typeof p === 'object' &&
    isNonEmptyString(p.logo) &&
    isString(p.nom) &&
    isString(p.url)
  );
}

function isValidGaleriePhoto(p) {
  return (
    p && typeof p === 'object' &&
    isNonEmptyString(p.url) &&
    isString(p.alt) &&
    typeof p.large === 'boolean'
  );
}

function isValidGaleriePhotos(g) {
  if (!g || typeof g !== 'object') return false;
  return ['club', 'feminines', 'ados', 'competition'].every(
    (key) => Array.isArray(g[key]) && g[key].every(isValidGaleriePhoto)
  );
}

export function isValidContent(content) {
  return (
    content && typeof content === 'object' &&
    isValidContact(content.contact) &&
    Array.isArray(content.horaires) && content.horaires.every(isValidCreneau) &&
    Array.isArray(content.tarifs) && content.tarifs.every(isValidTarif) &&
    isValidPalmares(content.palmares) &&
    isValidGaleriePhotos(content.galeriePhotos) &&
    Array.isArray(content.partenaires) && content.partenaires.every(isValidPartenaire)
  );
}
