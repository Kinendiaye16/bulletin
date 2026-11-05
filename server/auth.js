import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const newToken = () => randomBytes(32).toString('hex');

// Code de secours : 12 caractères sans signes ambigus (pas de 0/O, 1/I/L), lisible en groupes « ABCD-EFGH-JKMN ».
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  const raw = [...randomBytes(12)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  return raw.match(/.{4}/g).join('-');
}
/** Le code saisi peut contenir des espaces, des tirets ou des minuscules. */
export const normalizeRecoveryCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
