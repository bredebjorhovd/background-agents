import { describe, it, expect, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { generateInternalToken } from "./auth/internal";
import type { Env } from "./types";

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const secret = (env as Env).INTERNAL_CALLBACK_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_CALLBACK_SECRET binding is required for tests");
  }
  const token = await generateInternalToken(secret);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return SELF.fetch(`https://example.com${path}`, { ...init, headers });
}

describe("sessions API (e2e)", () => {
  it("creates a session and returns state via GET", async () => {
    const createResponse = await authorizedFetch("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoOwner: "OctoCat", repoName: "Hello-World" }),
    });

    expect(createResponse.status).toBe(201);
    const createBody = (await createResponse.json()) as { sessionId: string; status: string };
    expect(createBody.status).toBe("created");
    expect(createBody.sessionId).toBeTruthy();

    const stateResponse = await authorizedFetch(`/sessions/${createBody.sessionId}`);
    expect(stateResponse.status).toBe(200);
    const state = (await stateResponse.json()) as {
      repoOwner: string;
      repoName: string;
      repoDefaultBranch: string;
      status: string;
    };

    expect(state.repoOwner).toBe("octocat");
    expect(state.repoName).toBe("hello-world");
    expect(state.repoDefaultBranch).toBe("main");
    expect(state.status).toBe("created");
  });

  it("lists created sessions via /sessions", async () => {
    const createResponse = await authorizedFetch("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoOwner: "acme", repoName: "widgets" }),
    });

    const createBody = (await createResponse.json()) as { sessionId: string; status: string };
    expect(createBody.status).toBe("created");

    const listResponse = await authorizedFetch("/sessions?limit=10");
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      sessions: Array<{ id: string; repoOwner: string; repoName: string }>;
      hasMore: boolean;
    };

    const created = listBody.sessions.find((session) => session.id === createBody.sessionId);
    expect(created).toBeTruthy();
    expect(created?.repoOwner).toBe("acme");
    expect(created?.repoName).toBe("widgets");
  });

  it("adds and lists participants for a session", async () => {
    const createResponse = await authorizedFetch("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoOwner: "acme",
        repoName: "widgets",
        userId: "user-1",
        githubLogin: "octo-user",
      }),
    });

    const createBody = (await createResponse.json()) as { sessionId: string };

    const addResponse = await authorizedFetch(`/sessions/${createBody.sessionId}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-2", githubName: "Teammate" }),
    });

    expect(addResponse.status).toBe(200);
    const addBody = (await addResponse.json()) as { status: string; id: string };
    expect(addBody.status).toBe("added");
    expect(addBody.id).toBeTruthy();

    const listResponse = await authorizedFetch(`/sessions/${createBody.sessionId}/participants`);
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      participants: Array<{ userId: string; githubLogin: string | null; role: string }>;
    };

    const owner = listBody.participants.find((p) => p.userId === "user-1");
    const member = listBody.participants.find((p) => p.userId === "user-2");
    expect(owner?.role).toBe("owner");
    expect(owner?.githubLogin).toBe("octo-user");
    expect(member?.role).toBe("member");
  });

  it("queues a prompt and exposes it via /messages", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("--open-inspect-api-create-sandbox.modal.run")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              sandbox_id: "sandbox-123",
              modal_object_id: "modal-obj-1",
              status: "spawning",
              created_at: Date.now(),
              preview_tunnel_url: null,
              tunnel_urls: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    });
    try {
      const createResponse = await authorizedFetch("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoOwner: "acme", repoName: "widgets" }),
      });

      const createBody = (await createResponse.json()) as { sessionId: string };

      const promptResponse = await authorizedFetch(`/sessions/${createBody.sessionId}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Fix the bug" }),
      });

      expect(promptResponse.status).toBe(200);
      const promptBody = (await promptResponse.json()) as { messageId: string; status: string };
      expect(promptBody.status).toBe("queued");
      expect(promptBody.messageId).toBeTruthy();

      const messagesResponse = await authorizedFetch(
        `/sessions/${createBody.sessionId}/messages?limit=10`
      );
      expect(messagesResponse.status).toBe(200);
      const messagesBody = (await messagesResponse.json()) as {
        messages: Array<{ id: string; content: string; status: string }>;
      };

      const queued = messagesBody.messages.find((message) => message.id === promptBody.messageId);
      expect(queued?.content).toBe("Fix the bug");
      expect(queued?.status).toBe("processing");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists sandbox events and returns them via /events", async () => {
    const createResponse = await authorizedFetch("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoOwner: "acme", repoName: "widgets" }),
    });

    const createBody = (await createResponse.json()) as { sessionId: string };
    const typedEnv = env as Env;
    const doId = typedEnv.SESSION.idFromName(createBody.sessionId);
    const stub = typedEnv.SESSION.get(doId);

    const eventPayload = {
      type: "token",
      content: "hello",
      messageId: "msg-1",
      sandboxId: "sandbox-1",
      timestamp: Date.now(),
    };

    const eventResponse = await stub.fetch("http://internal/internal/sandbox-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload),
    });

    expect(eventResponse.status).toBe(200);
    await eventResponse.json();

    const listResponse = await authorizedFetch(`/sessions/${createBody.sessionId}/events?limit=5`);
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      events: Array<{ type: string; data: { sandboxId: string; content: string } }>;
    };

    const tokenEvent = listBody.events.find((event) => event.type === "token");
    expect(tokenEvent?.data.content).toBe("hello");
    expect(tokenEvent?.data.sandboxId).toBe("sandbox-1");
  });
});
