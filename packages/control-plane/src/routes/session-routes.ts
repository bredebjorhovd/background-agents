/**
 * Session route handlers.
 * Handles session lifecycle, prompts, artifacts, and related operations.
 */

import type { Env, CreateSessionRequest, CreateSessionResponse } from "../types";
import { generateId, encryptToken } from "../auth/crypto";
import { json, error, getSessionStub } from "./helpers";

/**
 * List all sessions with pagination.
 * GET /sessions?limit=50&cursor=xxx
 */
export async function handleListSessions(
  request: Request,
  env: Env,
  _match: RegExpMatchArray
): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const cursor = url.searchParams.get("cursor") || undefined;

  // List sessions from KV index
  const listResult = await env.SESSION_INDEX.list({
    prefix: "session:",
    limit,
    cursor,
  });

  // Fetch session data for each key
  const sessions = await Promise.all(
    listResult.keys.map(async (key) => {
      const data = await env.SESSION_INDEX.get(key.name, "json");
      return data;
    })
  );

  return json({
    sessions: sessions.filter(Boolean),
    cursor: listResult.list_complete ? undefined : listResult.cursor,
    hasMore: !listResult.list_complete,
  });
}

/**
 * Create a new session.
 * POST /sessions
 */
export async function handleCreateSession(
  request: Request,
  env: Env,
  _match: RegExpMatchArray
): Promise<Response> {
  const body = (await request.json()) as CreateSessionRequest & {
    // Optional GitHub token for PR creation (will be encrypted and stored)
    githubToken?: string;
    // User info
    userId?: string;
    githubLogin?: string;
    githubName?: string;
    githubEmail?: string;
  };

  if (!body.repoOwner || !body.repoName) {
    return error("repoOwner and repoName are required");
  }

  // Normalize repo identifiers to lowercase for consistent storage
  const repoOwner = body.repoOwner.toLowerCase();
  const repoName = body.repoName.toLowerCase();

  // User info from direct params
  const userId = body.userId || "anonymous";
  const githubLogin = body.githubLogin;
  const githubName = body.githubName;
  const githubEmail = body.githubEmail;
  let githubTokenEncrypted: string | null = null;

  // If GitHub token provided, encrypt it
  if (body.githubToken && env.TOKEN_ENCRYPTION_KEY) {
    try {
      githubTokenEncrypted = await encryptToken(body.githubToken, env.TOKEN_ENCRYPTION_KEY);
    } catch (e) {
      console.error("Failed to encrypt GitHub token:", e);
      return error("Failed to process GitHub token", 500);
    }
  }

  // Generate session ID
  const sessionId = generateId();

  // Get Durable Object
  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  // Initialize session with user info and optional encrypted token
  const initResponse = await stub.fetch(
    new Request("http://internal/internal/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionName: sessionId, // Pass the session name for WebSocket routing
        repoOwner,
        repoName,
        title: body.title,
        model: body.model || "claude-haiku-4-5", // Default to haiku for cost efficiency
        userId,
        githubLogin,
        githubName,
        githubEmail,
        githubTokenEncrypted, // Pass encrypted token to store with owner
      }),
    })
  );

  if (!initResponse.ok) {
    return error("Failed to create session", 500);
  }

  // Store session in KV index for listing
  const now = Date.now();
  await env.SESSION_INDEX.put(
    `session:${sessionId}`,
    JSON.stringify({
      id: sessionId,
      title: body.title || null,
      repoOwner,
      repoName,
      model: body.model || "claude-haiku-4-5",
      status: "created",
      createdAt: now,
      updatedAt: now,
    })
  );

  const result: CreateSessionResponse = {
    sessionId,
    status: "created",
  };

  return json(result, 201);
}

/**
 * Get session state.
 * GET /sessions/:id
 */
export async function handleGetSession(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const response = await stub.fetch(new Request("http://internal/internal/state"));

  if (!response.ok) {
    return error("Session not found", 404);
  }

  return response;
}

/**
 * Delete a session.
 * DELETE /sessions/:id
 */
export async function handleDeleteSession(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  // Delete from KV index
  await env.SESSION_INDEX.delete(`session:${sessionId}`);

  // Note: Durable Object data will be garbage collected by Cloudflare
  // when no longer referenced. We could also call a cleanup method on the DO.

  return json({ status: "deleted", sessionId });
}

/**
 * Send a prompt to the session.
 * POST /sessions/:id/prompt
 */
export async function handleSessionPrompt(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  console.log("handleSessionPrompt: start");
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  console.log("handleSessionPrompt: sessionId", sessionId);
  const body = (await request.json()) as {
    content: string;
    authorId?: string;
    source?: string;
    attachments?: Array<{ type: string; name: string; url?: string }>;
    callbackContext?: {
      channel: string;
      threadTs: string;
      repoFullName: string;
      model: string;
    };
  };

  if (!body.content) {
    return error("content is required");
  }

  console.log("handleSessionPrompt: getting DO stub");
  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  console.log("handleSessionPrompt: calling DO");
  const response = await stub.fetch(
    new Request("http://internal/internal/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: body.content,
        authorId: body.authorId || "anonymous",
        source: body.source || "web",
        attachments: body.attachments,
        callbackContext: body.callbackContext,
      }),
    })
  );

  console.log("handleSessionPrompt: response status", response.status);
  return response;
}

/**
 * Stop the session.
 * POST /sessions/:id/stop
 */
export async function handleSessionStop(
  _request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const stub = getSessionStub(env, match);
  if (!stub) return error("Session ID required");

  return stub.fetch(new Request("http://internal/internal/stop", { method: "POST" }));
}

/**
 * Get session events.
 * GET /sessions/:id/events
 */
export async function handleSessionEvents(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const stub = getSessionStub(env, match);
  if (!stub) return error("Session ID required");

  const url = new URL(request.url);
  return stub.fetch(new Request(`http://internal/internal/events${url.search}`));
}

/**
 * Get session artifacts.
 * GET /sessions/:id/artifacts
 */
export async function handleSessionArtifacts(
  _request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const stub = getSessionStub(env, match);
  if (!stub) return error("Session ID required");

  return stub.fetch(new Request("http://internal/internal/artifacts"));
}

/**
 * Upload an artifact to the session.
 * POST /sessions/:id/artifacts
 */
export async function handlePostArtifact(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const url = new URL(request.url);
  const internalUrl = `http://internal/internal/artifacts${url.search}`;
  const forwarded = new Request(internalUrl, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  return stub.fetch(forwarded);
}

/**
 * Get artifact file (e.g., screenshot).
 * GET /sessions/:id/artifacts/:artifactId/file
 */
export async function handleGetArtifactFile(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  const artifactId = match.groups?.artifactId;
  if (!sessionId || !artifactId) return error("Session ID and artifact ID required");

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const url = new URL(request.url);
  return stub.fetch(
    new Request(`http://internal/internal/artifacts/${artifactId}/file${url.search}`)
  );
}

/**
 * Get preview URL for the session.
 * GET /sessions/:id/preview-url
 */
export async function handleGetPreviewUrl(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const stub = getSessionStub(env, match);
  if (!stub) return error("Session ID required");

  // Forward query params for port-specific URLs
  const url = new URL(request.url);
  const internalUrl = new URL("http://internal/internal/preview-url");
  internalUrl.search = url.search;

  return stub.fetch(new Request(internalUrl.toString()));
}

/**
 * Get session messages.
 * GET /sessions/:id/messages
 */
export async function handleSessionMessages(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const stub = getSessionStub(env, match);
  if (!stub) return error("Session ID required");

  const url = new URL(request.url);
  return stub.fetch(new Request(`http://internal/internal/messages${url.search}`));
}

/**
 * Create a pull request from the session.
 * POST /sessions/:id/pr
 */
export async function handleCreatePR(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  const body = (await request.json()) as {
    title: string;
    body: string;
    baseBranch?: string;
  };

  if (!body.title || !body.body) {
    return error("title and body are required");
  }

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const response = await stub.fetch(
    new Request("http://internal/internal/create-pr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: body.title,
        body: body.body,
        baseBranch: body.baseBranch,
      }),
    })
  );

  return response;
}

/**
 * Create a WebSocket token for the session.
 * POST /sessions/:id/ws-token
 */
export async function handleSessionWsToken(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  const body = (await request.json()) as {
    userId: string;
    githubUserId?: string;
    githubLogin?: string;
    githubName?: string;
    githubEmail?: string;
    githubToken?: string; // User's GitHub OAuth token for PR creation
    githubTokenExpiresAt?: number; // Token expiry timestamp in milliseconds
  };

  if (!body.userId) {
    return error("userId is required");
  }

  // Encrypt the GitHub token if provided
  let githubTokenEncrypted: string | null = null;
  if (body.githubToken && env.TOKEN_ENCRYPTION_KEY) {
    try {
      githubTokenEncrypted = await encryptToken(body.githubToken, env.TOKEN_ENCRYPTION_KEY);
    } catch (e) {
      console.error("[router] Failed to encrypt GitHub token:", e);
      // Continue without token - PR creation will fail if this user triggers it
    }
  }

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const response = await stub.fetch(
    new Request("http://internal/internal/ws-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: body.userId,
        githubUserId: body.githubUserId,
        githubLogin: body.githubLogin,
        githubName: body.githubName,
        githubEmail: body.githubEmail,
        githubTokenEncrypted,
        githubTokenExpiresAt: body.githubTokenExpiresAt,
      }),
    })
  );

  return response;
}

/**
 * Get element at point in session viewport.
 * POST /sessions/:id/element-at-point
 */
export async function handleSessionElementAtPoint(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  let body: { x: number; y: number; viewportWidth?: number; viewportHeight?: number };
  try {
    body = (await request.json()) as {
      x: number;
      y: number;
      viewportWidth?: number;
      viewportHeight?: number;
    };
  } catch {
    return error("Invalid JSON body", 400);
  }
  if (typeof body.x !== "number" || typeof body.y !== "number") {
    return error("x and y (numbers) required", 400);
  }

  const stub = getSessionStub(env, match);
  if (!stub) return error("Session ID required");

  const payload: { x: number; y: number; viewportWidth?: number; viewportHeight?: number } = {
    x: body.x,
    y: body.y,
  };
  if (typeof body.viewportWidth === "number" && typeof body.viewportHeight === "number") {
    payload.viewportWidth = body.viewportWidth;
    payload.viewportHeight = body.viewportHeight;
  }
  const response = await stub.fetch(
    new Request("http://internal/internal/element-at-point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    return json(err, response.status);
  }

  const data = await response.json();
  return json(data);
}

/**
 * Archive a session.
 * POST /sessions/:id/archive
 */
export async function handleArchiveSession(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  // Parse userId from request body for authorization
  let userId: string | undefined;
  try {
    const body = (await request.json()) as { userId?: string };
    userId = body.userId;
  } catch {
    // Body parsing failed, continue without userId
  }

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const response = await stub.fetch(
    new Request("http://internal/internal/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
  );

  if (response.ok) {
    // Update KV index
    const sessionData = (await env.SESSION_INDEX.get(`session:${sessionId}`, "json")) as Record<
      string,
      unknown
    > | null;
    if (sessionData) {
      await env.SESSION_INDEX.put(
        `session:${sessionId}`,
        JSON.stringify({
          ...sessionData,
          status: "archived",
          updatedAt: Date.now(),
        })
      );
    } else {
      console.warn(`Session ${sessionId} not found in KV index during archive`);
    }
  }

  return response;
}

/**
 * Unarchive a session.
 * POST /sessions/:id/unarchive
 */
export async function handleUnarchiveSession(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  // Parse userId from request body for authorization
  let userId: string | undefined;
  try {
    const body = (await request.json()) as { userId?: string };
    userId = body.userId;
  } catch {
    // Body parsing failed, continue without userId
  }

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const response = await stub.fetch(
    new Request("http://internal/internal/unarchive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
  );

  if (response.ok) {
    // Update KV index
    const sessionData = (await env.SESSION_INDEX.get(`session:${sessionId}`, "json")) as Record<
      string,
      unknown
    > | null;
    if (sessionData) {
      await env.SESSION_INDEX.put(
        `session:${sessionId}`,
        JSON.stringify({
          ...sessionData,
          status: "active",
          updatedAt: Date.now(),
        })
      );
    } else {
      console.warn(`Session ${sessionId} not found in KV index during unarchive`);
    }
  }

  return response;
}
