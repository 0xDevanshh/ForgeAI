import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/lib/encryption";
import { AppError } from "../src/middleware/errorHandler";

describe("encryption", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const plaintext = "gho_super-secret-github-access-token";
    const encrypted = encrypt(plaintext);

    expect(encrypted.split(":")).toHaveLength(3);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("uses a fresh IV (and ciphertext) on every call, even for identical plaintext", () => {
    const plaintext = "same-input-twice";
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);

    expect(first).not.toBe(second);
    expect(decrypt(first)).toBe(plaintext);
    expect(decrypt(second)).toBe(plaintext);
  });

  it("throws an AppError when the ciphertext has been tampered with", () => {
    const [iv, authTag, ciphertext] = encrypt("do-not-tamper-with-me").split(":");

    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;

    const tampered = `${iv}:${authTag}:${tamperedCiphertext.toString("base64")}`;

    expect(() => decrypt(tampered)).toThrow(AppError);
  });

  it("throws an AppError when the auth tag has been tampered with", () => {
    const [iv, authTag, ciphertext] = encrypt("another-secret-value").split(":");

    const tamperedAuthTag = Buffer.from(authTag, "base64");
    tamperedAuthTag[0] ^= 0xff;

    const tampered = `${iv}:${tamperedAuthTag.toString("base64")}:${ciphertext}`;

    expect(() => decrypt(tampered)).toThrow(AppError);
  });

  it("throws an AppError for a malformed encrypted string", () => {
    expect(() => decrypt("not-a-valid-encrypted-string")).toThrow(AppError);
  });
});
