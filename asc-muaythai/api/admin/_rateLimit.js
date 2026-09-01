// api/admin/_rateLimit.js
// Anti brute-force minimal pour les endpoints de mot de passe admin : verrouille
// une IP après plusieurs échecs. Stocké sur le même Vercel Blob que le reste de
// l'auth admin (pas de dépendance externe type Redis). Testé manuellement en
// local : le compteur peut sous-compter de quelques tentatives (lecture après
// écriture pas strictement immédiate sur le CDN Blob, même avec cache désactivé),
// donc le verrou peut s'enclencher un peu après le 5e échec plutôt que pile
// dessus — mais il finit toujours par s'enclencher et tient les 15 minutes. La
// vraie limite dure (le délai fixe de 1,5s par tentative dans login.js) reste la
// protection principale ; ce compteur est une couche supplémentaire, pas
// garantie exacte.
// L'IP (contrôlée par l'en-tête X-Forwarded-For) est utilisée uniquement comme
// clé de Map, jamais comme accès de propriété d'objet, pour exclure toute
// pollution de prototype (ex. IP forgée à "__proto__").
//
// Une seule lecture du blob par requête (voir loadRateLimitState) : relire deux
// fois par requête (une fois pour vérifier le verrou, une fois pour enregistrer
// l'échec) doublait le risque de lire une copie périmée. cacheControlMaxAge:0 +
// cache-buster sur l'URL réduisent (sans l'éliminer) le risque de lecture périmée.
import { put } from '@vercel/blob';
import { secretPathname } from './_auth.js';

const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map((s) => s.trim());
    return ips[ips.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function readAttempts(pathname) {
  try {
    const res = await fetch(`${BLOB_BASE}/${pathname}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return new Map();
    const entries = await res.json();
    return Array.isArray(entries) ? new Map(entries) : new Map();
  } catch {
    return new Map();
  }
}

function purgeExpired(attempts, now) {
  for (const [key, value] of attempts) {
    if (!value || value.resetAt < now) attempts.delete(key);
  }
  return attempts;
}

async function writeAttempts(pathname, attempts) {
  await put(pathname, JSON.stringify([...attempts]), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  }).catch(() => {});
}

// À appeler une seule fois en tête du handler. Renvoie un état à réutiliser
// pour isLocked/recordFailedLogin/clearLoginAttempts sur la même requête.
// `namespace` isole le compteur par usage (ex. "login-attempts",
// "upload-document") : chacun a son propre blob, ses propres seuils.
export async function loadRateLimitState(req, namespace = 'login-attempts') {
  const pathname = secretPathname(namespace);
  const ip = getClientIp(req);
  const now = Date.now();
  const attempts = purgeExpired(await readAttempts(pathname), now);
  return { ip, now, attempts, pathname };
}

// Renvoie le nombre de minutes d'attente restantes si l'IP est verrouillée, sinon null.
export function isLocked({ ip, now, attempts }, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  const entry = attempts.get(ip);
  if (entry && entry.count >= maxAttempts) {
    return Math.max(1, Math.ceil((entry.resetAt - now) / 60000));
  }
  return null;
}

// Nom historique (utilisé par login.js) : incrémente simplement le compteur
// de tentatives pour l'IP, quel que soit le namespace/usage.
export async function recordFailedLogin({ ip, now, attempts, pathname }, windowMs = DEFAULT_WINDOW_MS) {
  const entry = attempts.get(ip);
  if (entry) entry.count += 1;
  else attempts.set(ip, { count: 1, resetAt: now + windowMs });

  await writeAttempts(pathname, attempts);
}

export async function clearLoginAttempts({ ip, attempts, pathname }) {
  if (attempts.has(ip)) {
    attempts.delete(ip);
    await writeAttempts(pathname, attempts);
  }
}
