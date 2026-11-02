/**
 * Comparación de secretos en tiempo constante.
 * Se calcula HMAC-SHA256 de ambos valores con una clave aleatoria por llamada
 * (longitud fija, sin filtrar la longitud del secreto) y se comparan los bytes sin cortocircuito.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function digestHex(key: CryptoKey, value: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function secretEquals(provided: string | null | undefined, expected: string | null | undefined): Promise<boolean> {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const [a, b] = await Promise.all([digestHex(key, provided), digestHex(key, expected)]);
  return timingSafeEqual(a, b);
}

/** True si Authorization es exactamente `Bearer <ADMIN_SECRET>`; falla cerrado si el secreto falta. */
export async function isAdminAuthorized(authHeader: string | null | undefined, adminSecret: string | null | undefined): Promise<boolean> {
  if (!adminSecret || !authHeader) return false;
  return secretEquals(authHeader, `Bearer ${adminSecret}`);
}
