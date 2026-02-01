/**
 * Tests for Linear integration validation schemas.
 */

import { describe, it, expect } from "vitest";
import { LinkTaskRequestSchema, UnlinkTaskRequestSchema, ListIssuesQuerySchema } from "./linear";

describe("LinkTaskRequestSchema", () => {
  it("should accept valid link task request", () => {
    const valid = {
      issueId: "ISSUE-123",
      teamId: "team-abc",
    };

    const result = LinkTaskRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject empty issueId", () => {
    const invalid = {
      issueId: "",
      teamId: "team-abc",
    };

    const result = LinkTaskRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("issue ID");
    }
  });

  it("should reject empty teamId", () => {
    const invalid = {
      issueId: "ISSUE-123",
      teamId: "",
    };

    const result = LinkTaskRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("team ID");
    }
  });

  it("should reject missing fields", () => {
    const invalid = {
      issueId: "ISSUE-123",
    };

    const result = LinkTaskRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject extra fields", () => {
    const invalid = {
      issueId: "ISSUE-123",
      teamId: "team-abc",
      extraField: "not allowed",
    };

    const result = LinkTaskRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("UnlinkTaskRequestSchema", () => {
  it("should accept empty object", () => {
    const valid = {};

    const result = UnlinkTaskRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject extra fields", () => {
    const invalid = {
      issueId: "ISSUE-123",
    };

    const result = UnlinkTaskRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("ListIssuesQuerySchema", () => {
  it("should accept valid query with all parameters", () => {
    const valid = {
      teamId: "team-abc",
      filter: "active",
    };

    const result = ListIssuesQuerySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should accept empty query", () => {
    const valid = {};

    const result = ListIssuesQuerySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filter).toBe("active");
    }
  });

  it("should default filter to active", () => {
    const valid = {
      teamId: "team-abc",
    };

    const result = ListIssuesQuerySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filter).toBe("active");
    }
  });

  it("should accept all valid filter values", () => {
    const filters = ["all", "active", "backlog", "completed"];

    for (const filter of filters) {
      const result = ListIssuesQuerySchema.safeParse({ filter });
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid filter", () => {
    const invalid = {
      filter: "invalid",
    };

    const result = ListIssuesQuerySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
