# @neon-pixels/crypto

Encrypt secrets you store (API tokens, credentials) with AES-256-GCM. Payloads are versioned and name the key that wrote them, so you can rotate keys without breaking old values. Uses only Node's built-in `crypto`; nothing is read from `process.env`.

## Install

```sh
pnpm add @neon-pixels/crypto
```

## Usage

Keys are passed in as arguments. Generate one with `openssl rand -base64 32`, load it from your own config, and decode it with `decodeKey`.

```ts
import { decodeKey, decrypt, encrypt } from "@neon-pixels/crypto";

const keys = { primary: decodeKey(process.env.MY_APP_KEY ?? "") };

// Associated data is optional. Pass something that identifies where the
// value is stored; decrypting with a different value fails.
const payload = encrypt("api-token", keys, `integration:${rowId}`);
const token = decrypt(payload, keys, `integration:${rowId}`);
```

### API

- `encrypt(plaintext, keys, associatedData?)` returns a payload string, written with `keys.primary`.
- `decrypt(payload, keys, associatedData?)` returns the plaintext. The payload names its key, so it decrypts with any key in the set.
- `isEncryptedWithPrimaryKey(payload, keys)` is `true` when the payload was written with the primary key.
- `reencrypt(payload, keys, associatedData?)` returns the value encrypted under the primary key. A payload already on the primary key is returned unchanged.
- `decodeKey(base64)` turns a base64 string into a 32-byte key and rejects anything else.
- `deriveKeyId(key)` returns the key id stored in payloads.
- `KeySet` is `{ primary: Uint8Array; previous?: Uint8Array[] }`. Keys must be exactly 32 bytes.

Empty associated data is rejected, so "empty" and "none" can never differ between encrypt and decrypt.

### Errors

Every failure throws `SecretCryptoError` with a `code`: `invalid-key`, `invalid-associated-data`, `invalid-plaintext`, `malformed-payload`, `unsupported-version`, `unknown-key`, or `decryption-failed`. Messages are fixed text and never include keys, plaintext, or payload contents.

## Payload format

One string of five `:`-separated segments:

```
v2:<keyId>:<iv>:<authTag>:<ciphertext>
```

- `v2` is the format version. Any other version is rejected.
- `keyId` is the first 8 hex characters of the SHA-256 of the key. It is not secret and cannot be reversed to the key.
- `iv` is a random 12-byte IV, base64.
- `authTag` is the 16-byte GCM tag, base64.
- `ciphertext` is the AES-256-GCM output, base64.

Associated data is authenticated through GCM's AAD but is not stored in the payload.

## Rotating a key

1. Generate a new key and add it to your config next to the current one.
2. Deploy with the new key as `primary` and the old key in `previous`. New writes use the new key; old values still decrypt.

   ```ts
   const keys = { primary: newKey, previous: [oldKey] };
   ```

3. Re-encrypt stored values with `reencrypt`, passing the same associated data each was written with:

   ```ts
   for (const row of rows) {
     if (!isEncryptedWithPrimaryKey(row.secret, keys)) {
       row.secret = reencrypt(row.secret, keys, `integration:${row.id}`);
       await save(row);
     }
   }
   ```

4. When no stored value uses the old key, remove it from `previous`. Values still on it would then fail with `unknown-key`.
