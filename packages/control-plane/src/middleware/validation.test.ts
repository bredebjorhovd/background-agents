/**
 * Tests for validation middleware.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateBody, validateQuery, validateParams } from "./validation";

describe("validateBody", () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it("should validate valid request body", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ name: "Alice", age: 30 }),
    });

    const result = await validateBody(request, TestSchema);

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.name).toBe("Alice");
      expect(result.age).toBe(30);
    }
  });

  it("should return error response for invalid body", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ name: "", age: 30 }),
    });

    const result = await validateBody(request, TestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
      const body = (await result.json()) as { error: string; details?: unknown };
      expect(body.error).toContain("Validation error");
      expect(body.error).toContain("name");
    }
  });

  it("should return error response for missing field", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
    });

    const result = await validateBody(request, TestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
      const body = (await result.json()) as { error: string; details?: unknown };
      expect(body.error).toContain("age");
    }
  });

  it("should return error response for invalid JSON", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "not json",
    });

    const result = await validateBody(request, TestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
      const body = (await result.json()) as { error: string; details?: unknown };
      expect(body.error).toContain("Invalid JSON");
    }
  });

  it("should return error response for wrong type", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ name: "Alice", age: "thirty" }),
    });

    const result = await validateBody(request, TestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
      const body = (await result.json()) as { error: string; details?: unknown };
      expect(body.error).toContain("age");
    }
  });

  it("should include validation details in error response", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ name: "", age: -5 }),
    });

    const result = await validateBody(request, TestSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      const body = (await result.json()) as { error: string; details?: unknown };
      expect(body.details).toBeDefined();
      expect(Array.isArray(body.details)).toBe(true);
    }
  });
});

describe("validateQuery", () => {
  const QuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  });

  it("should validate valid query parameters", () => {
    const request = new Request("https://example.com?page=1&limit=10");

    const result = validateQuery(request, QuerySchema);

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.page).toBe("1");
      expect(result.limit).toBe("10");
    }
  });

  it("should validate request with no query parameters", () => {
    const request = new Request("https://example.com");

    const result = validateQuery(request, QuerySchema);

    expect(result).not.toBeInstanceOf(Response);
  });

  it("should return error response for invalid query parameter", () => {
    const request = new Request("https://example.com?limit=abc");

    const result = validateQuery(request, QuerySchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

describe("validateParams", () => {
  const ParamsSchema = z.object({
    sessionId: z.string().uuid(),
    participantId: z.string().min(1),
  });

  it("should validate valid path parameters", () => {
    const params = {
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      participantId: "participant-123",
    };

    const result = validateParams(params, ParamsSchema);

    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.sessionId).toBe(params.sessionId);
      expect(result.participantId).toBe(params.participantId);
    }
  });

  it("should return error response for invalid UUID", () => {
    const params = {
      sessionId: "not-a-uuid",
      participantId: "participant-123",
    };

    const result = validateParams(params, ParamsSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });

  it("should return error response for missing parameter", () => {
    const params = {
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = validateParams(params, ParamsSchema);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});
