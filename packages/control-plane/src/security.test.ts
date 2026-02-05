import { describe, it, expect } from "vitest";
import { getCorsOrigin } from "./middleware";
import { CreateSessionRequestSchema } from "./schemas/session";
import type { Env } from "./types";

describe("security", () => {
  describe("CORS allowlist", () => {
    const baseEnv = {
      DEPLOYMENT_NAME: "production",
    } as Env;

    it("allows production web app origin", () => {
      const request = new Request("https://example.com/health", {
        headers: { Origin: "https://open-inspect.vercel.app" },
      });

      expect(getCorsOrigin(request, baseEnv)).toBe("https://open-inspect.vercel.app");
    });

    it("allows preview deployment origin", () => {
      const request = new Request("https://example.com/health", {
        headers: { Origin: "https://open-inspect-pr-123.vercel.app" },
      });

      expect(getCorsOrigin(request, baseEnv)).toBe("https://open-inspect-pr-123.vercel.app");
    });

    it("rejects unknown origin", () => {
      const request = new Request("https://example.com/health", {
        headers: { Origin: "https://evil.com" },
      });

      expect(getCorsOrigin(request, baseEnv)).toBeNull();
    });

    it("allows localhost in development", () => {
      const request = new Request("https://example.com/health", {
        headers: { Origin: "http://localhost:5173" },
      });

      const devEnv = { ...baseEnv, DEPLOYMENT_NAME: "development" } as Env;
      expect(getCorsOrigin(request, devEnv)).toBe("http://localhost:5173");
    });
  });

  describe("input validation", () => {
    it("rejects invalid repo owner", () => {
      const invalid = {
        repoOwner: "-octo",
        repoName: "hello-world",
      };

      const result = CreateSessionRequestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid repo name", () => {
      const invalid = {
        repoOwner: "octocat",
        repoName: "hello/world",
      };

      const result = CreateSessionRequestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
