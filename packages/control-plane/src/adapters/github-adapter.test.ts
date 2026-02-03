import { describe, it, expect, vi } from "vitest";
import { GitHubAdapter } from "./github-adapter";
import { encryptToken, generateEncryptionKey } from "../auth/crypto";

describe("GitHubAdapter", () => {
  it("creates a pull request and returns mapped response", async () => {
    const encryptionKey = generateEncryptionKey();
    const accessTokenEncrypted = await encryptToken("test-token", encryptionKey);
    const adapter = new GitHubAdapter(null, {
      clientId: "client-id",
      clientSecret: "client-secret",
      encryptionKey,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          number: 42,
          html_url: "https://github.com/acme/widgets/pull/42",
          url: "https://api.github.com/repos/acme/widgets/pulls/42",
          state: "open",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await adapter.createPullRequest({
        owner: "acme",
        repo: "widgets",
        title: "Fix issue",
        body: "Details",
        head: "feature-branch",
        base: "main",
        accessTokenEncrypted,
      });

      expect(result).toEqual({
        number: 42,
        url: "https://api.github.com/repos/acme/widgets/pulls/42",
        htmlUrl: "https://github.com/acme/widgets/pull/42",
        state: "open",
      });
    } finally {
      vi.unstubAllGlobals();
      globalThis.fetch = originalFetch;
    }
  });
});
