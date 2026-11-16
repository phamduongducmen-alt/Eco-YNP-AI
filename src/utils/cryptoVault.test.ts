import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptPayloadAes256, encryptPayloadAes256, rotateDeviceAesKey } from './cryptoVault';

test('encryptPayloadAes256 and decryptPayloadAes256 round-trip AI Life World mood journal payload', async () => {
  const original = {
    note: 'Hôm nay tôi thiền 15 phút và cảm thấy tâm trí nhẹ nhàng hơn.',
    tags: ['Bình tĩnh', 'Biết ơn'],
    moodScore: 5,
  };
  const envelope = await encryptPayloadAes256(original);
  assert.equal(envelope.algorithm, 'AES-GCM-256');
  assert.ok(envelope.ciphertextBase64.length > 12);
  const decrypted = await decryptPayloadAes256<typeof original>(envelope);
  assert.deepEqual(decrypted, original);
});

test('rotateDeviceAesKey issues a fresh key fingerprint', async () => {
  const fp = await rotateDeviceAesKey();
  assert.ok(fp.length >= 6);
});
