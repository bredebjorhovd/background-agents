import { describe, it, expect, vi } from "vitest";
import { getInstallationToken } from "./github-app";

describe("GitHub App auth", () => {
  it("retrieves installation token from GitHub API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "installation-token",
          expires_at: new Date().toISOString(),
          permissions: { contents: "read" },
          repository_selection: "all",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);

    try {
      const token = await getInstallationToken("jwt-token", "12345");
      expect(token).toBe("installation-token");
    } finally {
      vi.unstubAllGlobals();
      globalThis.fetch = originalFetch;
    }
  });
});
