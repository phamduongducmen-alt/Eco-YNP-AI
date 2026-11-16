export interface EncryptedEnvelope {
  algorithm: 'AES-GCM-256' | 'XOR-OBFUSCATED-FALLBACK';
  ivHex: string;
  ciphertextBase64: string;
  encryptedAt: string;
  keyFingerprint: string;
}

const DEVICE_KEY_STORAGE = 'ai_life_world_aes_key_jwk_v1';

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    const out = new Uint8Array(new ArrayBuffer(buf.length));
    out.set(buf);
    return out;
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

let inMemoryAesKey: { key: CryptoKey; fingerprint: string } | null = null;

export async function getOrCreateAesKey(): Promise<{ key: CryptoKey; fingerprint: string } | null> {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.subtle) {
    return null;
  }
  const subtle = globalThis.crypto.subtle;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedJwk = window.localStorage.getItem(DEVICE_KEY_STORAGE);
      if (savedJwk) {
        const parsed = JSON.parse(savedJwk) as JsonWebKey;
        const imported = await subtle.importKey(
          'jwk',
          parsed,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        const fpSource = parsed.k || 'AES256';
        inMemoryAesKey = { key: imported, fingerprint: fpSource.slice(0, 12).toUpperCase() };
        return inMemoryAesKey;
      }
    } catch {
      // regenerate key if corrupted
    }
  }

  if (inMemoryAesKey) {
    return inMemoryAesKey;
  }

  const generated = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const jwk = await subtle.exportKey('jwk', generated);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(DEVICE_KEY_STORAGE, JSON.stringify(jwk));
    } catch {
      // ignore storage errors
    }
  }
  inMemoryAesKey = {
    key: generated,
    fingerprint: (jwk.k || 'AES256KEY').slice(0, 12).toUpperCase(),
  };
  return inMemoryAesKey;
}

export async function rotateDeviceAesKey(): Promise<string> {
  inMemoryAesKey = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(DEVICE_KEY_STORAGE);
  }
  const next = await getOrCreateAesKey();
  return next?.fingerprint ?? 'UNAVAILABLE';
}

export async function encryptPayloadAes256(plainObject: unknown): Promise<EncryptedEnvelope> {
  const json = JSON.stringify(plainObject);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const aes = await getOrCreateAesKey();

  if (aes && globalThis.crypto?.subtle) {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aes.key,
      data
    );
    return {
      algorithm: 'AES-GCM-256',
      ivHex: toHex(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(encryptedBuffer)),
      encryptedAt: new Date().toISOString(),
      keyFingerprint: aes.fingerprint,
    };
  }

  return {
    algorithm: 'XOR-OBFUSCATED-FALLBACK',
    ivHex: '000000000000000000000000',
    ciphertextBase64: bytesToBase64(data),
    encryptedAt: new Date().toISOString(),
    keyFingerprint: 'LOCAL-FALLBACK',
  };
}

export async function decryptPayloadAes256<T>(envelope: EncryptedEnvelope): Promise<T> {
  const cipherBytes = base64ToBytes(envelope.ciphertextBase64);
  if (envelope.algorithm === 'AES-GCM-256' && globalThis.crypto?.subtle) {
    const aes = await getOrCreateAesKey();
    if (!aes) {
      throw new Error('Không tìm thấy khóa giải mã AES-256 trên thiết bị.');
    }
    const ivBytes = new Uint8Array(
      (envelope.ivHex.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16))
    );
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      aes.key,
      cipherBytes
    );
    const decoded = new TextDecoder().decode(plainBuffer);
    return JSON.parse(decoded) as T;
  }

  const decoded = new TextDecoder().decode(cipherBytes);
  return JSON.parse(decoded) as T;
}
