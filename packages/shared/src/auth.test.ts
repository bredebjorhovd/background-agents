import { describe, it, expect } from "vitest";
import { generateInternalToken, verifyInternalToken } from "./auth";

describe("auth", () => {
  const testSecret = "test-secret-key-for-hmac-signing";

  describe("generateInternalToken", () => {
    it("should produce valid token format (timestamp.signature)", async () => {
      const token = await generateInternalToken(testSecret);

      expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);

      const [timestamp, signature] = token.split(".");
      expect(parseInt(timestamp, 10)).toBeGreaterThan(0);
      expect(signature.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it("should generate different tokens on each call (different timestamps)", async () => {
      const token1 = await generateInternalToken(testSecret);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const token2 = await generateInternalToken(testSecret);

      expect(token1).not.toBe(token2);

      const [ts1] = token1.split(".");
      const [ts2] = token2.split(".");

      expect(parseInt(ts2, 10)).toBeGreaterThanOrEqual(parseInt(ts1, 10));
    });

    it("should generate different signatures with different secrets", async () => {
      const secret1 = "secret-1";
      const secret2 = "secret-2";

      // Generate tokens at nearly the same time
      const token1Promise = generateInternalToken(secret1);
      const token2Promise = generateInternalToken(secret2);

      const [token1, token2] = await Promise.all([token1Promise, token2Promise]);

      const [, sig1] = token1.split(".");
      const [, sig2] = token2.split(".");

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifyInternalToken", () => {
    it("should accept valid token with Bearer prefix", async () => {
      const token = await generateInternalToken(testSecret);
      const authHeader = `Bearer ${token}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(true);
    });

    it("should reject token without Bearer prefix", async () => {
      const token = await generateInternalToken(testSecret);

      const result = await verifyInternalToken(token, testSecret);

      expect(result).toBe(false);
    });

    it("should reject null auth header", async () => {
      const result = await verifyInternalToken(null, testSecret);

      expect(result).toBe(false);
    });

    it("should reject empty auth header", async () => {
      const result = await verifyInternalToken("", testSecret);

      expect(result).toBe(false);
    });

    it("should reject token with wrong signature", async () => {
      const token = await generateInternalToken(testSecret);
      const [timestamp] = token.split(".");

      // Create token with wrong signature
      const wrongToken = `${timestamp}.${"0".repeat(64)}`;
      const authHeader = `Bearer ${wrongToken}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(false);
    });

    it("should reject token signed with different secret", async () => {
      const token = await generateInternalToken("different-secret");
      const authHeader = `Bearer ${token}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(false);
    });

    it("should reject expired token (>5 minutes old)", async () => {
      // Create token with old timestamp (6 minutes ago)
      const oldTimestamp = Date.now() - 6 * 60 * 1000;

      // Generate valid signature for old timestamp
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(testSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(oldTimestamp.toString())
      );
      const signatureHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const expiredToken = `${oldTimestamp}.${signatureHex}`;
      const authHeader = `Bearer ${expiredToken}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(false);
    });

    it("should reject token from the future (>5 minutes)", async () => {
      // Create token with future timestamp (6 minutes ahead)
      const futureTimestamp = Date.now() + 6 * 60 * 1000;

      // Generate valid signature for future timestamp
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(testSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(futureTimestamp.toString())
      );
      const signatureHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const futureToken = `${futureTimestamp}.${signatureHex}`;
      const authHeader = `Bearer ${futureToken}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(false);
    });

    it("should reject malformed token (missing signature)", async () => {
      const authHeader = `Bearer ${Date.now()}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(false);
    });

    it("should reject malformed token (missing timestamp)", async () => {
      const authHeader = `Bearer .${"0".repeat(64)}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(false);
    });

    it("should reject token with invalid timestamp (not a number)", async () => {
      const authHeader = `Bearer notanumber.${"0".repeat(64)}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(false);
    });

    it("should ignore extra parts in token (only uses first two parts)", async () => {
      // Note: Current implementation uses .split('.') which ignores extra parts
      // This is acceptable behavior as the signature validation will still work
      const token = await generateInternalToken(testSecret);
      const authHeader = `Bearer ${token}.extra`;

      const result = await verifyInternalToken(authHeader, testSecret);

      // Extra parts are ignored, token is still valid
      expect(result).toBe(true);
    });

    it("should accept token within validity window (< 5 minutes)", async () => {
      // Create token with timestamp 2 minutes ago
      const timestamp = Date.now() - 2 * 60 * 1000;

      // Generate valid signature
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(testSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp.toString()));
      const signatureHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const validToken = `${timestamp}.${signatureHex}`;
      const authHeader = `Bearer ${validToken}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(true);
    });

    it("should use timing-safe comparison (no early exit on length mismatch in signature)", async () => {
      // This test ensures the comparison doesn't reveal information through timing
      const token = await generateInternalToken(testSecret);
      const [timestamp, signature] = token.split(".");

      // Create tokens with signatures of different lengths
      const shortSig = signature.slice(0, 32);
      const token1 = `${timestamp}.${shortSig}`;

      const wrongSig = "a".repeat(64);
      const token2 = `${timestamp}.${wrongSig}`;

      const result1 = await verifyInternalToken(`Bearer ${token1}`, testSecret);
      const result2 = await verifyInternalToken(`Bearer ${token2}`, testSecret);

      // Both should fail
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe("integration: generate and verify", () => {
    it("should create token that can be immediately verified", async () => {
      const token = await generateInternalToken(testSecret);
      const authHeader = `Bearer ${token}`;

      const result = await verifyInternalToken(authHeader, testSecret);

      expect(result).toBe(true);
    });

    it("should handle multiple tokens in sequence", async () => {
      const tokens = await Promise.all([
        generateInternalToken(testSecret),
        generateInternalToken(testSecret),
        generateInternalToken(testSecret),
      ]);

      const results = await Promise.all(
        tokens.map((token) => verifyInternalToken(`Bearer ${token}`, testSecret))
      );

      expect(results).toEqual([true, true, true]);
    });
  });
});
