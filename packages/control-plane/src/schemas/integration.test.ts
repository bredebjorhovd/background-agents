/**
 * Integration tests to verify validation schemas work end-to-end.
 */

import { describe, it, expect } from "vitest";
import { validateBody } from "../middleware/validation";
import {
  CreateSessionRequestSchema,
  SessionPromptRequestSchema,
  CreatePRRequestSchema,
  LinkTaskRequestSchema,
} from "./index";

describe("Schema integration tests", () => {
  it("should validate complete session creation flow", async () => {
    const validRequest = new Request("https://example.com/sessions", {
      method: "POST",
      body: JSON.stringify({
        repoOwner: "octocat",
        repoName: "hello-world",
        title: "Fix authentication bug",
        model: "claude-sonnet-4-5",
      }),
    });

    const result = await validateBody(validRequest, CreateSessionRequestSchema);

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.repoOwner).toBe("octocat");
      expect(result.repoName).toBe("hello-world");
      expect(result.title).toBe("Fix authentication bug");
      expect(result.model).toBe("claude-sonnet-4-5");
    }
  });

  it("should reject session creation with invalid model", async () => {
    const invalidRequest = new Request("https://example.com/sessions", {
      method: "POST",
      body: JSON.stringify({
        repoOwner: "octocat",
        repoName: "hello-world",
        model: "gpt-4",
      }),
    });

    const result = await validateBody(invalidRequest, CreateSessionRequestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
      const body = (await result.json()) as { error: string };
      expect(body.error).toContain("model");
    }
  });

  it("should validate prompt request with attachments", async () => {
    const validRequest = new Request("https://example.com/prompt", {
      method: "POST",
      body: JSON.stringify({
        content: "Review this file",
        model: "claude-haiku-4-5",
        attachments: [
          {
            type: "file",
            name: "auth.ts",
            content: "export function login() {}",
          },
          {
            type: "url",
            name: "Docs",
            url: "https://docs.example.com",
          },
        ],
      }),
    });

    const result = await validateBody(validRequest, SessionPromptRequestSchema);

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.content).toBe("Review this file");
      expect(result.attachments).toHaveLength(2);
      expect(result.attachments![0].type).toBe("file");
      expect(result.attachments![1].type).toBe("url");
    }
  });

  it("should validate PR creation request", async () => {
    const validRequest = new Request("https://example.com/pr", {
      method: "POST",
      body: JSON.stringify({
        title: "Fix authentication bug",
        body: "This PR fixes the issue where users couldn't log in.",
        targetBranch: "develop",
        draft: true,
      }),
    });

    const result = await validateBody(validRequest, CreatePRRequestSchema);

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.title).toBe("Fix authentication bug");
      expect(result.draft).toBe(true);
    }
  });

  it("should validate Linear task linking", async () => {
    const validRequest = new Request("https://example.com/linear", {
      method: "POST",
      body: JSON.stringify({
        issueId: "ISSUE-123",
        teamId: "team-abc",
      }),
    });

    const result = await validateBody(validRequest, LinkTaskRequestSchema);

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.issueId).toBe("ISSUE-123");
      expect(result.teamId).toBe("team-abc");
    }
  });

  it("should provide clear error messages", async () => {
    const invalidRequest = new Request("https://example.com/sessions", {
      method: "POST",
      body: JSON.stringify({
        repoOwner: "",
        repoName: "hello-world",
      }),
    });

    const result = await validateBody(invalidRequest, CreateSessionRequestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      const body = (await result.json()) as { error: string; details?: unknown };
      expect(body.error).toContain("Validation error");
      expect(body.error).toContain("repoOwner");
      expect(body.details).toBeDefined();
    }
  });

  it("should reject requests with extra fields", async () => {
    const invalidRequest = new Request("https://example.com/sessions", {
      method: "POST",
      body: JSON.stringify({
        repoOwner: "octocat",
        repoName: "hello-world",
        extraField: "not allowed",
      }),
    });

    const result = await validateBody(invalidRequest, CreateSessionRequestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});
