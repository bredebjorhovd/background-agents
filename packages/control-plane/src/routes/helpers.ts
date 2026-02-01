/**
 * Route helper functions and utilities.
 */

import type { Env } from "../types";
import { verifyInternalToken } from "../auth/internal";

/**
 * Routes that do not require authentication.
 */
export const PUBLIC_ROUTES: RegExp[] = [
  /^\/health$/,
  /^\/sessions\/[^/]+\/artifacts\/[^/]+\/file$/, // Artifact files (screenshots) are public
];

/**
 * Routes that accept sandbox authentication.
 * These are session-specific routes that can be called by sandboxes using their auth token.
 * The sandbox token is validated by the Durable Object.
 */
export const SANDBOX_AUTH_ROUTES: RegExp[] = [
  /^\/sessions\/[^/]+\/pr$/, // PR creation from sandbox
  /^\/sessions\/[^/]+\/artifacts$/, // Artifact upload (screenshot, preview) from sandbox
  /^\/sessions\/[^/]+\/preview-url$/, // Get preview tunnel URL (sandbox)
  /^\/sessions\/[^/]+\/stream-frame$/, // Screenshot stream frames from sandbox
];

/**
 * Parse route pattern into regex.
 */
export function parsePattern(pattern: string): RegExp {
  const regexPattern = pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)");
  return new RegExp(`^${regexPattern}$`);
}

/**
 * Create JSON response.
 */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create error response.
 */
export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/**
 * Get Durable Object stub for a session.
 * Returns the stub or null if session ID is missing.
 */
export function getSessionStub(env: Env, match: RegExpMatchArray): DurableObjectStub | null {
  const sessionId = match.groups?.id;
  if (!sessionId) return null;

  const doId = env.SESSION.idFromName(sessionId);
  return env.SESSION.get(doId);
}

/**
 * Check if a path matches any public route pattern.
 */
export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some((pattern) => pattern.test(path));
}

/**
 * Check if a path matches any sandbox auth route pattern.
 */
export function isSandboxAuthRoute(path: string): boolean {
  return SANDBOX_AUTH_ROUTES.some((pattern) => pattern.test(path));
}

/**
 * Validate sandbox authentication by checking with the Durable Object.
 * The DO stores the expected sandbox auth token.
 *
 * @param request - The incoming request
 * @param env - Environment bindings
 * @param sessionId - Session ID extracted from path
 * @returns null if authentication passes, or an error Response to return immediately
 */
export async function verifySandboxAuth(
  request: Request,
  env: Env,
  sessionId: string
): Promise<Response | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return error("Unauthorized: Missing sandbox token", 401);
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  // Ask the Durable Object to validate this sandbox token
  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const verifyResponse = await stub.fetch(
    new Request("http://internal/internal/verify-sandbox-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
  );

  if (!verifyResponse.ok) {
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    console.warn(
      `[auth] Sandbox auth failed for ${request.method} /sessions/${sessionId}/pr from ${clientIP}`
    );
    return error("Unauthorized: Invalid sandbox token", 401);
  }

  return null; // Auth passed
}

/**
 * Require internal API authentication for service-to-service calls.
 * Fails closed: returns error response if secret is not configured or token is invalid.
 *
 * @param request - The incoming request
 * @param env - Environment bindings
 * @param path - Request path for logging
 * @returns null if authentication passes, or an error Response to return immediately
 */
export async function requireInternalAuth(
  request: Request,
  env: Env,
  path: string
): Promise<Response | null> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    console.error("[auth] INTERNAL_CALLBACK_SECRET not configured - rejecting request");
    return error("Internal authentication not configured", 500);
  }

  const isValid = await verifyInternalToken(
    request.headers.get("Authorization"),
    env.INTERNAL_CALLBACK_SECRET
  );

  if (!isValid) {
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    console.warn(`[auth] Authentication failed for ${request.method} ${path} from ${clientIP}`);
    return error("Unauthorized", 401);
  }

  return null; // Auth passed
}
