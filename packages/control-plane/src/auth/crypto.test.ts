import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, generateEncryptionKey, generateId, hashToken } from "./crypto";

describe("crypto", () => {
  describe("encryptToken/decryptToken", () => {
    it("should encrypt and decrypt a token successfully (round-trip)", async () => {
      const key = generateEncryptionKey();
      const originalToken = "gho_1234567890abcdefghijklmnopqrstuvwxyz";

      const encrypted = await encryptToken(originalToken, key);
      const decrypted = await decryptToken(encrypted, key);

      expect(decrypted).toBe(originalToken);
    });

    it("should produce different ciphertext for same token (random IV)", async () => {
      const key = generateEncryptionKey();
      const token = "test-token";

      const encrypted1 = await encryptToken(token, key);
      const encrypted2 = await encryptToken(token, key);

      expect(encrypted1).not.toBe(encrypted2);

      const decrypted1 = await decryptToken(encrypted1, key);
      const decrypted2 = await decryptToken(encrypted2, key);

      expect(decrypted1).toBe(token);
      expect(decrypted2).toBe(token);
    });

    it("should fail to decrypt with wrong key", async () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      const token = "secret-token";

      const encrypted = await encryptToken(token, key1);

      await expect(decryptToken(encrypted, key2)).rejects.toThrow();
    });

    it("should fail to decrypt tampered ciphertext", async () => {
      const key = generateEncryptionKey();
      const token = "secret-token";

      const encrypted = await encryptToken(token, key);

      // Tamper with the ciphertext by changing a character
      const tampered =
        encrypted.slice(0, -1) + (encrypted[encrypted.length - 1] === "A" ? "B" : "A");

      await expect(decryptToken(tampered, key)).rejects.toThrow();
    });

    it("should handle empty string token", async () => {
      const key = generateEncryptionKey();
      const token = "";

      const encrypted = await encryptToken(token, key);
      const decrypted = await decryptToken(encrypted, key);

      expect(decrypted).toBe(token);
    });

    it("should handle long token values", async () => {
      const key = generateEncryptionKey();
      const longToken = "a".repeat(1000);

      const encrypted = await encryptToken(longToken, key);
      const decrypted = await decryptToken(encrypted, key);

      expect(decrypted).toBe(longToken);
    });

    it("should handle special characters in token", async () => {
      const key = generateEncryptionKey();
      const specialToken = 'token-with-special-chars: !@#$%^&*()_+{}[]|\\:";<>?,./~`';

      const encrypted = await encryptToken(specialToken, key);
      const decrypted = await decryptToken(encrypted, key);

      expect(decrypted).toBe(specialToken);
    });
  });

  describe("generateEncryptionKey", () => {
    it("should generate a valid 32-byte base64 key", () => {
      const key = generateEncryptionKey();

      // Base64 encoded 32 bytes should be 44 characters (32 * 4/3 rounded up)
      expect(key.length).toBe(44);

      // Should be valid base64
      expect(() => atob(key)).not.toThrow();

      // Decoded should be 32 bytes
      const decoded = atob(key);
      expect(decoded.length).toBe(32);
    });

    it("should generate different keys on each call", () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      const key3 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });

    it("should generate keys that work for encryption", async () => {
      const key = generateEncryptionKey();
      const token = "test-token";

      // Should not throw
      const encrypted = await encryptToken(token, key);
      const decrypted = await decryptToken(encrypted, key);

      expect(decrypted).toBe(token);
    });
  });

  describe("generateId", () => {
    it("should generate hex string of correct length (default 16 bytes)", () => {
      const id = generateId();

      // 16 bytes = 32 hex characters
      expect(id.length).toBe(32);
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    it("should generate hex string of custom length", () => {
      const id8 = generateId(8);
      expect(id8.length).toBe(16); // 8 bytes = 16 hex chars

      const id32 = generateId(32);
      expect(id32.length).toBe(64); // 32 bytes = 64 hex chars

      const id1 = generateId(1);
      expect(id1.length).toBe(2); // 1 byte = 2 hex chars
    });

    it("should generate different IDs on each call", () => {
      const id1 = generateId();
      const id2 = generateId();
      const id3 = generateId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it("should only contain lowercase hex characters", () => {
      const ids = Array.from({ length: 10 }, () => generateId());

      ids.forEach((id) => {
        expect(/^[0-9a-f]+$/.test(id)).toBe(true);
        expect(/[A-F]/.test(id)).toBe(false);
      });
    });
  });

  describe("hashToken", () => {
    it("should produce consistent SHA-256 hash for same input", async () => {
      const token = "test-token";

      const hash1 = await hashToken(token);
      const hash2 = await hashToken(token);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", async () => {
      const hash1 = await hashToken("token1");
      const hash2 = await hashToken("token2");
      const hash3 = await hashToken("token3");

      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
      expect(hash1).not.toBe(hash3);
    });

    it("should produce 64-character hex string (SHA-256)", async () => {
      const hash = await hashToken("test-token");

      // SHA-256 produces 32 bytes = 64 hex characters
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it("should handle empty string", async () => {
      const hash = await hashToken("");

      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it("should handle long strings", async () => {
      const longString = "a".repeat(10000);
      const hash = await hashToken(longString);

      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it("should produce expected hash for known input", async () => {
      // Known SHA-256 hash of "test"
      const expectedHash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
      const hash = await hashToken("test");

      expect(hash).toBe(expectedHash);
    });

    it("should be case-sensitive", async () => {
      const hashLower = await hashToken("test");
      const hashUpper = await hashToken("TEST");

      expect(hashLower).not.toBe(hashUpper);
    });
  });
});
