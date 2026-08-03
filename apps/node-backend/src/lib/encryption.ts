import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // GCM's recommended nonce size

const KEY = Buffer.from(env.ENCRYPTION_KEY, "base64");

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decrypt(encryptedString: string): string {
  try {
    const [ivPart, authTagPart, ciphertextPart] = encryptedString.split(":");
    if (!ivPart || !authTagPart || !ciphertextPart) {
      throw new Error("malformed encrypted string");
    }

    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");

    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Covers a malformed string, a bad IV, and (most importantly) GCM's
    // auth tag verification failing on tampered/corrupt ciphertext — all of
    // these mean "don't trust this value," not "here's a stack trace."
    throw new AppError("Failed to decrypt data: authentication failed or data is corrupt", 500);
  }
}
