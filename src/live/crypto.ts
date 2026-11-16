/**
 * End-to-end encryption for live rooms. Messages go through a public relay, so everything is sealed
 * with AES-GCM using a key that only exists in the invite link (after the #, which browsers never
 * send to any server). The topic name is bound in as associated data, so a sealed message can't be
 * replayed onto another topic.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(str: string): Uint8Array | null {
  try {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** 128-bit random key, 22 characters in the link. */
export function newSecret(): string {
  return toB64u(crypto.getRandomValues(new Uint8Array(16)));
}

export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export async function importSecret(secret: string): Promise<CryptoKey | null> {
  const raw = fromB64u(secret);
  if (!raw || raw.length !== 16 || !cryptoAvailable()) return null;
  try {
    return await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

export async function seal(key: CryptoKey, topic: string, value: unknown): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(topic) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  const out = new Uint8Array(12 + body.byteLength);
  out.set(iv);
  out.set(new Uint8Array(body), 12);
  return out;
}

/** null for anything that isn't ours: wrong key, tampered, or junk someone else published. */
export async function unseal(key: CryptoKey, topic: string, data: Uint8Array): Promise<unknown> {
  if (data.length < 13 || data.length > 64_000) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: enc.encode(topic) },
      key,
      data.slice(12),
    );
    return JSON.parse(dec.decode(plain));
  } catch {
    return null;
  }
}
