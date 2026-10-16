import { authAPI } from '../api/client';

const decodeBase64 = (value) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** Prove locally that a PEM private key matches the signed-in account's public key. */
export async function verifyEncryptionPrivateKey(privateKeyPem) {
  const match = privateKeyPem.trim().match(
    /^-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----$/
  );
  if (!match) {
    throw new Error('Use the unencrypted PKCS#8 encryption private key from this account’s key backup.');
  }

  const challenge = await authAPI.createEncryptionKeyChallenge();
  const pkcs8 = decodeBase64(match[1].replace(/\s/g, ''));
  let privateKey;
  try {
    privateKey = await window.crypto.subtle.importKey(
      'pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']
    );
  } catch {
    throw new Error('The encryption private key is not a valid supported PEM key.');
  }

  let decrypted;
  try {
    decrypted = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' }, privateKey, decodeBase64(challenge.data.encrypted_challenge_b64)
    );
  } catch {
    throw new Error('This private key does not match the encryption public key registered to the signed-in account. Import that account’s original key backup.');
  }

  let binary = '';
  for (const byte of new Uint8Array(decrypted)) binary += String.fromCharCode(byte);
  const decryptedChallengeB64 = btoa(binary);
  await authAPI.verifyEncryptionKey({
    challenge_token: challenge.data.challenge_token,
    decrypted_challenge_b64: decryptedChallengeB64,
  });
  return true;
}
