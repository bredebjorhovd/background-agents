/**
 * Tests for participant validation schemas.
 */

import { describe, it, expect } from "vitest";
import { AddParticipantRequestSchema, UpdateParticipantRequestSchema } from "./participant";

describe("AddParticipantRequestSchema", () => {
  it("should accept valid participant request with explicit role", () => {
    const valid = {
      userId: "user-123",
      role: "owner",
    };

    const result = AddParticipantRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("owner");
    }
  });

  it("should default role to member", () => {
    const valid = {
      userId: "user-123",
    };

    const result = AddParticipantRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("member");
    }
  });

  it("should reject empty userId", () => {
    const invalid = {
      userId: "",
    };

    const result = AddParticipantRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("User ID");
    }
  });

  it("should reject invalid role", () => {
    const invalid = {
      userId: "user-123",
      role: "admin",
    };

    const result = AddParticipantRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject extra fields", () => {
    const invalid = {
      userId: "user-123",
      extraField: "not allowed",
    };

    const result = AddParticipantRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("UpdateParticipantRequestSchema", () => {
  it("should accept valid role update to owner", () => {
    const valid = {
      role: "owner",
    };

    const result = UpdateParticipantRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should accept valid role update to member", () => {
    const valid = {
      role: "member",
    };

    const result = UpdateParticipantRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject invalid role", () => {
    const invalid = {
      role: "admin",
    };

    const result = UpdateParticipantRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject missing role", () => {
    const invalid = {};

    const result = UpdateParticipantRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject extra fields", () => {
    const invalid = {
      role: "owner",
      userId: "user-123",
    };

    const result = UpdateParticipantRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
