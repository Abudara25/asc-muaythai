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
const PATHNAME = secretPathname('login-attempts');
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map((s) => s.trim());
    return ips[ips.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function readAttempts() {
  try {
    const res = await fetch(`${BLOB_BASE}/${PATHNAME}?t=${Date.now()}`, { cache: 'no-store' });
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

async function writeAttempts(attempts) {
  await put(PATHNAME, JSON.stringify([...attempts]), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  }).catch(() => {});
}

// À appeler une seule fois en tête du handler. Renvoie un état à réutiliser
// pour isLocked/recordFailedLogin/clearLoginAttempts sur la même requête.
export async function loadRateLimitState(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const attempts = purgeExpired(await readAttempts(), now);
  return { ip, now, attempts };
}

// Renvoie le nombre de minutes d'attente restantes si l'IP est verrouillée, sinon null.
export function isLocked({ ip, now, attempts }) {
  const entry = attempts.get(ip);
  if (entry && entry.count >= MAX_ATTEMPTS) {
    return Math.max(1, Math.ceil((entry.resetAt - now) / 60000));
  }
  return null;
}

export async function recordFailedLogin({ ip, now, attempts }) {
  const entry = attempts.get(ip);
  if (entry) entry.count += 1;
  else attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });

  await writeAttempts(attempts);
}

export async function clearLoginAttempts({ ip, attempts }) {
  if (attempts.has(ip)) {
    attempts.delete(ip);
    await writeAttempts(attempts);
  }
}
