import { describe, it, expect, vi } from "vitest";
import { LinearAdapter } from "./linear-adapter";

describe("LinearAdapter", () => {
  it("lists issues and returns pagination metadata", async () => {
    const adapter = new LinearAdapter("linear-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            issues: {
              nodes: [
                {
                  id: "issue-1",
                  identifier: "ENG-1",
                  title: "Bug",
                  description: "Fix it",
                  url: "https://linear.app/acme/issue/ENG-1",
                  state: { id: "state-1", name: "Todo" },
                  team: { id: "team-1", key: "ENG", name: "Engineering" },
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await adapter.listIssues({ limit: 10 });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].identifier).toBe("ENG-1");
      expect(result.cursor).toBe("cursor-1");
      expect(result.hasMore).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      globalThis.fetch = originalFetch;
    }
  });
});
