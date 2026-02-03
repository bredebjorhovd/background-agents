import { describe, it, expect, vi } from "vitest";
import { ModalAdapter } from "./modal-adapter";

describe("ModalAdapter", () => {
  it("creates a sandbox and returns mapped response", async () => {
    const adapter = new ModalAdapter("modal-secret", "test-workspace");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            sandbox_id: "sandbox-1",
            modal_object_id: "obj-1",
            status: "spawning",
            created_at: 123456,
            preview_tunnel_url: "https://preview.example.com",
            tunnel_urls: { 3000: "https://tunnel.example.com" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await adapter.createSandbox({
        sessionId: "session-1",
        repoOwner: "acme",
        repoName: "widgets",
        sandboxAuthToken: "sandbox-token",
        controlPlaneUrl: "https://control.example.com",
      });

      expect(result).toEqual({
        sandboxId: "sandbox-1",
        modalObjectId: "obj-1",
        status: "spawning",
        createdAt: 123456,
        previewTunnelUrl: "https://preview.example.com",
        tunnelUrls: { 3000: "https://tunnel.example.com" },
      });
    } finally {
      vi.unstubAllGlobals();
      globalThis.fetch = originalFetch;
    }
  });
});
