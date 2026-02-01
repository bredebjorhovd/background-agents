/**
 * Tests for pull request validation schemas.
 */

import { describe, it, expect } from "vitest";
import { CreatePRRequestSchema } from "./pr";

describe("CreatePRRequestSchema", () => {
  it("should accept valid PR request with all fields", () => {
    const valid = {
      title: "Fix authentication bug",
      body: "This PR fixes the authentication issue by...",
      targetBranch: "develop",
      draft: true,
    };

    const result = CreatePRRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should accept minimal valid PR request", () => {
    const valid = {
      title: "Fix bug",
    };

    const result = CreatePRRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draft).toBe(false);
    }
  });

  it("should default draft to false", () => {
    const valid = {
      title: "Fix bug",
    };

    const result = CreatePRRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draft).toBe(false);
    }
  });

  it("should reject empty title", () => {
    const invalid = {
      title: "",
    };

    const result = CreatePRRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("title");
    }
  });

  it("should reject title longer than 200 characters", () => {
    const invalid = {
      title: "a".repeat(201),
    };

    const result = CreatePRRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject missing title", () => {
    const invalid = {};

    const result = CreatePRRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject extra fields", () => {
    const invalid = {
      title: "Fix bug",
      assignees: ["user1"],
    };

    const result = CreatePRRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
