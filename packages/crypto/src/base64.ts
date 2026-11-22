const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64_GROUP_LENGTH = 4;

/** Decodes canonical base64 only: invalid characters and non-canonical padding return null. */
export function decodeStrictBase64(text: string): Buffer | null {
  if (!BASE64_PATTERN.test(text)) {
    return null;
  }
  const decoded = Buffer.from(text, "base64");
  return decoded.toString("base64") === text ? decoded : null;
}

/** Restores the padding that some secret stores strip. */
export function padBase64(text: string): string {
  const unpadded = text.replace(/=+$/, "");
  const missing =
    (BASE64_GROUP_LENGTH - (unpadded.length % BASE64_GROUP_LENGTH)) %
    BASE64_GROUP_LENGTH;
  return unpadded + "=".repeat(missing);
}
