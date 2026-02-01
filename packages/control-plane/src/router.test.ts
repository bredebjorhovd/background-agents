import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "./router";
import { generateInternalToken } from "./auth/internal";
import type { Env } from "./types";

describe("router authentication", () => {
  let mockEnv: Env;
  const testSecret = "test-internal-secret";

  beforeEach(() => {
    mockEnv = {
      INTERNAL_CALLBACK_SECRET: testSecret,
      SESSION_INDEX: {
        list: vi.fn().mockResolvedValue({
          keys: [],
          list_complete: true,
          cursor: undefined,
        }),
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      } as any,
      SESSION: {
        idFromName: vi.fn((name: string) => ({ name }) as any),
        get: vi.fn(() => ({
          fetch: vi
            .fn()
            .mockResolvedValue(new Response(JSON.stringify({ valid: true }), { status: 200 })),
        })),
      } as any,
    } as Env;
  });

  describe("CORS preflight (OPTIONS)", () => {
    it("should return correct CORS headers for OPTIONS request", async () => {
      const request = new Request("https://example.com/sessions", {
        method: "OPTIONS",
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type, Authorization"
      );
      expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    });

    it("should return CORS headers for protected route OPTIONS", async () => {
      const request = new Request("https://example.com/sessions/123", {
        method: "OPTIONS",
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("public routes", () => {
    it("should allow access to /health without authentication", async () => {
      const request = new Request("https://example.com/health");

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(200);
      const data = (await response.json()) as { error?: string; [key: string]: unknown };
      expect(data).toEqual({
        status: "healthy",
        service: "open-inspect-control-plane",
      });
    });

    it("should return CORS headers for public routes", async () => {
      const request = new Request("https://example.com/health");

      const response = await handleRequest(request, mockEnv);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("protected routes - HMAC authentication", () => {
    it("should require authentication for protected routes", async () => {
      const request = new Request("https://example.com/sessions");

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error?: string; [key: string]: unknown };
      expect(data.error).toBe("Unauthorized");
    });

    it("should accept valid HMAC token", async () => {
      const token = await generateInternalToken(testSecret);
      const request = new Request("https://example.com/sessions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const response = await handleRequest(request, mockEnv);

      // Should succeed (not 401)
      expect(response.status).not.toBe(401);
    });

    it("should reject invalid HMAC token", async () => {
      const request = new Request("https://example.com/sessions", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error?: string; [key: string]: unknown };
      expect(data.error).toBe("Unauthorized");
    });

    it("should reject expired HMAC token", async () => {
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

      const request = new Request("https://example.com/sessions", {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(401);
    });

    it("should return 500 if INTERNAL_CALLBACK_SECRET is not configured", async () => {
      const envWithoutSecret = {
        ...mockEnv,
        INTERNAL_CALLBACK_SECRET: undefined,
      } as any;

      const request = new Request("https://example.com/sessions");

      const response = await handleRequest(request, envWithoutSecret);

      expect(response.status).toBe(500);
      const data = (await response.json()) as { error?: string; [key: string]: unknown };
      expect(data.error).toBe("Internal authentication not configured");
    });

    it("should include CORS headers in auth error responses", async () => {
      const request = new Request("https://example.com/sessions");

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(401);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("sandbox authentication", () => {
    it("should accept valid sandbox token for sandbox-auth routes", async () => {
      // Setup mock DO that validates sandbox token
      mockEnv.SESSION = {
        idFromName: vi.fn((name: string) => ({ name }) as any),
        get: vi.fn(() => ({
          fetch: vi.fn().mockImplementation((req: Request) => {
            const url = new URL(req.url);
            if (url.pathname === "/internal/verify-sandbox-token") {
              return Promise.resolve(
                new Response(JSON.stringify({ valid: true }), { status: 200 })
              );
            }
            // Mock PR creation response
            return Promise.resolve(
              new Response(JSON.stringify({ prUrl: "https://github.com/owner/repo/pull/1" }), {
                status: 200,
              })
            );
          }),
        })),
      } as any;

      const request = new Request("https://example.com/sessions/test-session-id/pr", {
        method: "POST",
        headers: {
          Authorization: "Bearer sandbox-token-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test PR",
          body: "Test body",
        }),
      });

      const response = await handleRequest(request, mockEnv);

      // Should succeed (not 401)
      expect(response.status).not.toBe(401);
    });

    it("should reject invalid sandbox token", async () => {
      // Setup mock DO that rejects sandbox token
      mockEnv.SESSION = {
        idFromName: vi.fn((name: string) => ({ name }) as any),
        get: vi.fn(() => ({
          fetch: vi.fn().mockImplementation((req: Request) => {
            const url = new URL(req.url);
            if (url.pathname === "/internal/verify-sandbox-token") {
              return Promise.resolve(new Response("Invalid token", { status: 401 }));
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
          }),
        })),
      } as any;

      const request = new Request("https://example.com/sessions/test-session-id/pr", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-sandbox-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test PR",
          body: "Test body",
        }),
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error?: string; [key: string]: unknown };
      expect(data.error).toContain("Invalid sandbox token");
    });

    it("should require Bearer prefix for sandbox token", async () => {
      mockEnv.SESSION = {
        idFromName: vi.fn((name: string) => ({ name }) as any),
        get: vi.fn(() => ({
          fetch: vi.fn(),
        })),
      } as any;

      const request = new Request("https://example.com/sessions/test-session-id/pr", {
        method: "POST",
        headers: {
          Authorization: "sandbox-token-no-bearer",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test PR",
          body: "Test body",
        }),
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error?: string; [key: string]: unknown };
      expect(data.error).toContain("Missing sandbox token");
    });

    it("should fallback to HMAC auth if sandbox route also accepts HMAC", async () => {
      const token = await generateInternalToken(testSecret);

      // Mock DO for PR creation
      mockEnv.SESSION = {
        idFromName: vi.fn((name: string) => ({ name }) as any),
        get: vi.fn(() => ({
          fetch: vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ prUrl: "https://github.com/owner/repo/pull/1" }), {
              status: 200,
            })
          ),
        })),
      } as any;

      const request = new Request("https://example.com/sessions/test-session-id/pr", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test PR",
          body: "Test body",
        }),
      });

      const response = await handleRequest(request, mockEnv);

      // HMAC auth should pass, so not 401
      expect(response.status).not.toBe(401);
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown routes", async () => {
      const token = await generateInternalToken(testSecret);

      const request = new Request("https://example.com/unknown-route", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(404);
      const data = (await response.json()) as { error?: string; [key: string]: unknown };
      expect(data.error).toBe("Not found");
    });

    it("should return 404 for unknown routes (note: CORS headers missing - known issue)", async () => {
      const token = await generateInternalToken(testSecret);

      const request = new Request("https://example.com/unknown-route", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const response = await handleRequest(request, mockEnv);

      expect(response.status).toBe(404);
      // TODO: CORS headers should be added to 404 responses
      // expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("authentication priority", () => {
    it("should try HMAC auth first, then sandbox auth for sandbox routes", async () => {
      // Setup mock with both valid HMAC and valid sandbox auth
      const token = await generateInternalToken(testSecret);

      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ prUrl: "https://github.com/owner/repo/pull/1" }), {
          status: 200,
        })
      );

      mockEnv.SESSION = {
        idFromName: vi.fn((name: string) => ({ name }) as any),
        get: vi.fn(() => ({
          fetch: fetchSpy,
        })),
      } as any;

      const request = new Request("https://example.com/sessions/test-session-id/pr", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test PR",
          body: "Test body",
        }),
      });

      await handleRequest(request, mockEnv);

      // With valid HMAC, should not call verify-sandbox-token
      const calls = fetchSpy.mock.calls;
      const verifyCalls = calls.filter(
        (call) => new URL(call[0].url).pathname === "/internal/verify-sandbox-token"
      );
      expect(verifyCalls.length).toBe(0);
    });
  });
});
