/**
 * Tests for session validation schemas.
 */

import { describe, it, expect } from "vitest";
import {
  CreateSessionRequestSchema,
  SessionPromptRequestSchema,
  UpdateSessionRequestSchema,
} from "./session";

describe("CreateSessionRequestSchema", () => {
  it("should accept valid session creation request", () => {
    const valid = {
      repoOwner: "octocat",
      repoName: "hello-world",
      title: "Fix login bug",
      model: "claude-sonnet-4-5",
    };

    const result = CreateSessionRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should accept minimal valid request", () => {
    const valid = {
      repoOwner: "octocat",
      repoName: "hello-world",
    };

    const result = CreateSessionRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject empty repoOwner", () => {
    const invalid = {
      repoOwner: "",
      repoName: "hello-world",
    };

    const result = CreateSessionRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("owner");
    }
  });

  it("should reject empty repoName", () => {
    const invalid = {
      repoOwner: "octocat",
      repoName: "",
    };

    const result = CreateSessionRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("name");
    }
  });

  it("should reject invalid model", () => {
    const invalid = {
      repoOwner: "octocat",
      repoName: "hello-world",
      model: "gpt-4",
    };

    const result = CreateSessionRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject extra fields", () => {
    const invalid = {
      repoOwner: "octocat",
      repoName: "hello-world",
      extraField: "not allowed",
    };

    const result = CreateSessionRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject title longer than 200 characters", () => {
    const invalid = {
      repoOwner: "octocat",
      repoName: "hello-world",
      title: "a".repeat(201),
    };

    const result = CreateSessionRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("SessionPromptRequestSchema", () => {
  it("should accept valid prompt request", () => {
    const valid = {
      content: "Fix the bug in auth.ts",
      model: "claude-haiku-4-5",
    };

    const result = SessionPromptRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should accept prompt with attachments", () => {
    const valid = {
      content: "Review this code",
      attachments: [
        {
          type: "file",
          name: "test.ts",
          content: "console.log('test')",
        },
      ],
    };

    const result = SessionPromptRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject empty content", () => {
    const invalid = {
      content: "",
    };

    const result = SessionPromptRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("content");
    }
  });

  it("should reject invalid attachment type", () => {
    const invalid = {
      content: "Test",
      attachments: [
        {
          type: "invalid",
          name: "test.ts",
        },
      ],
    };

    const result = SessionPromptRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject attachment with invalid URL", () => {
    const invalid = {
      content: "Test",
      attachments: [
        {
          type: "url",
          name: "link",
          url: "not-a-url",
        },
      ],
    };

    const result = SessionPromptRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("UpdateSessionRequestSchema", () => {
  it("should accept valid title update", () => {
    const valid = {
      title: "New title",
    };

    const result = UpdateSessionRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should accept empty object", () => {
    const valid = {};

    const result = UpdateSessionRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject title longer than 200 characters", () => {
    const invalid = {
      title: "a".repeat(201),
    };

    const result = UpdateSessionRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject extra fields", () => {
    const invalid = {
      title: "Valid",
      status: "completed",
    };

    const result = UpdateSessionRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
