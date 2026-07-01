// api/admin/_auth.js
// Authentification minimale pour l'espace admin : un seul compte (mot de passe
// partagé via variable d'environnement) et une session signée stockée en cookie.
import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'crypto';
import { put } from '@vercel/blob';

const BLOB_BASE = 'https://fiua9o5p0pdryoho.public.blob.vercel-storage.com';

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'dev-local-fallback-not-for-production';

// Vercel Blob ne propose pas d'accès privé : tout blob "public" est lisible
// par quiconque connaît son URL. Comme ce code source est public, un nom de
// fichier fixe (ex. "auth.json") expose le hash du mot de passe à tout le
// monde. On dérive donc le nom du blob à partir d'ADMIN_SESSION_SECRET (connu
// seulement du serveur) pour que l'URL reste impossible à deviner.
export function secretPathname(name) {
  const suffix = createHmac('sha256', SESSION_SECRET).update(name).digest('hex').slice(0, 24);
  return `${name}.${suffix}.json`;
}

const AUTH_PATHNAME = secretPathname('auth');

async function getStoredHash() {
  try {
    const res = await fetch(`${BLOB_BASE}/${AUTH_PATHNAME}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.hash || null;
  } catch {
    return null;
  }
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString('hex');
}

export async function storePassword(newPassword) {
  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  await put(AUTH_PATHNAME, JSON.stringify({ hash: `${salt}:${hash}` }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

const SESSION_COOKIE = 'asc_admin_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12h

function sign(value) {
  return createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

export function createSessionToken() {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

function isValidToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const idx = pair.indexOf('=');
      return [pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim())];
    })
  );
}

export function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return isValidToken(cookies[SESSION_COOKIE]);
}

export function setSessionCookie(res, token) {
  const maxAge = SESSION_DURATION_MS / 1000;
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  );
}

export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Non authentifié' });
  return false;
}

export async function checkPassword(password) {
  if (typeof password !== 'string' || !password) return false;

  const stored = await getStoredHash();
  if (stored) {
    const [salt, hash] = stored.split(':');
    const computed = hashPassword(password, salt);
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // Fallback : mot de passe initial via variable d'environnement
  const a = Buffer.from(password);
  const b = Buffer.from(process.env.ADMIN_PASSWORD || '');
  return a.length === b.length && timingSafeEqual(a, b);
}
