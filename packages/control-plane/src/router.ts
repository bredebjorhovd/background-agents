/**
 * API router for Open-Inspect Control Plane.
 */

import type { Env } from "./types";

// Import route handlers
import {
  // Helpers
  json,
  error,
  parsePattern,
  isPublicRoute,
  isSandboxAuthRoute,
  verifySandboxAuth,
  requireInternalAuth,
  // Session handlers
  handleListSessions,
  handleCreateSession,
  handleGetSession,
  handleDeleteSession,
  handleSessionPrompt,
  handleSessionStop,
  handleSessionEvents,
  handleSessionArtifacts,
  handlePostArtifact,
  handleGetArtifactFile,
  handleGetPreviewUrl,
  handleSessionMessages,
  handleCreatePR,
  handleSessionWsToken,
  handleSessionElementAtPoint,
  handleArchiveSession,
  handleUnarchiveSession,
  // Participant handlers
  handleSessionParticipants,
  handleAddParticipant,
  // Linear handlers
  handleLinearIssues,
  handleLinearTeams,
  handleLinearLinkTask,
  handleLinearLinkSession,
  handleLinearCreateIssue,
  handleLinearUpdateIssue,
  // Repo handlers
  handleListRepos,
  handleUpdateRepoMetadata,
  handleGetRepoMetadata,
} from "./routes";
import { getCorsOrigin, applyCorsHeaders } from "./middleware";

/**
 * Route configuration.
 */
interface Route {
  method: string;
  pattern: RegExp;
  handler: (request: Request, env: Env, match: RegExpMatchArray) => Promise<Response>;
}

/**
 * Routes definition.
 */
const routes: Route[] = [
  // Health check
  {
    method: "GET",
    pattern: parsePattern("/health"),
    handler: async () => json({ status: "healthy", service: "open-inspect-control-plane" }),
  },

  // Session management
  {
    method: "GET",
    pattern: parsePattern("/sessions"),
    handler: handleListSessions,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions"),
    handler: handleCreateSession,
  },
  {
    method: "GET",
    pattern: parsePattern("/sessions/:id"),
    handler: handleGetSession,
  },
  {
    method: "DELETE",
    pattern: parsePattern("/sessions/:id"),
    handler: handleDeleteSession,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/prompt"),
    handler: handleSessionPrompt,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/stop"),
    handler: handleSessionStop,
  },
  {
    method: "GET",
    pattern: parsePattern("/sessions/:id/events"),
    handler: handleSessionEvents,
  },
  {
    method: "GET",
    pattern: parsePattern("/sessions/:id/artifacts"),
    handler: handleSessionArtifacts,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/artifacts"),
    handler: handlePostArtifact,
  },
  {
    method: "GET",
    pattern: parsePattern("/sessions/:id/artifacts/:artifactId/file"),
    handler: handleGetArtifactFile,
  },
  {
    method: "GET",
    pattern: parsePattern("/sessions/:id/preview-url"),
    handler: handleGetPreviewUrl,
  },
  {
    method: "GET",
    pattern: parsePattern("/sessions/:id/participants"),
    handler: handleSessionParticipants,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/participants"),
    handler: handleAddParticipant,
  },
  {
    method: "GET",
    pattern: parsePattern("/sessions/:id/messages"),
    handler: handleSessionMessages,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/pr"),
    handler: handleCreatePR,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/ws-token"),
    handler: handleSessionWsToken,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/archive"),
    handler: handleArchiveSession,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/unarchive"),
    handler: handleUnarchiveSession,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/element-at-point"),
    handler: handleSessionElementAtPoint,
  },

  // Linear integration
  {
    method: "GET",
    pattern: parsePattern("/linear/issues"),
    handler: handleLinearIssues,
  },
  {
    method: "GET",
    pattern: parsePattern("/linear/teams"),
    handler: handleLinearTeams,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/linear/link-task"),
    handler: handleLinearLinkTask,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/linear/link-session"),
    handler: handleLinearLinkSession,
  },
  {
    method: "POST",
    pattern: parsePattern("/sessions/:id/linear/create-issue"),
    handler: handleLinearCreateIssue,
  },
  {
    method: "PATCH",
    pattern: parsePattern("/linear/issues/:id"),
    handler: handleLinearUpdateIssue,
  },

  // Repository management
  {
    method: "GET",
    pattern: parsePattern("/repos"),
    handler: handleListRepos,
  },
  {
    method: "PUT",
    pattern: parsePattern("/repos/:owner/:name/metadata"),
    handler: handleUpdateRepoMetadata,
  },
  {
    method: "GET",
    pattern: parsePattern("/repos/:owner/:name/metadata"),
    handler: handleGetRepoMetadata,
  },
];

/**
 * Match request to route and execute handler.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const corsOrigin = getCorsOrigin(request, env);

  // CORS preflight
  if (method === "OPTIONS") {
    return applyCorsHeaders(new Response(null, { status: 204 }), corsOrigin);
  }

  // Require authentication for non-public routes
  if (!isPublicRoute(path)) {
    // First try HMAC auth (for web app, slack bot, etc.)
    const hmacAuthError = await requireInternalAuth(request, env, path);

    if (hmacAuthError) {
      // HMAC auth failed - check if this route accepts sandbox auth
      if (isSandboxAuthRoute(path)) {
        // Extract session ID from path (e.g., /sessions/abc123/pr -> abc123)
        // Match /sessions/:id/... or /sessions/:id (e.g. /sessions/abc123/artifacts)
        const sessionIdMatch = path.match(/^\/sessions\/([^/]+)(?:\/|$)/);
        if (sessionIdMatch) {
          const sessionId = sessionIdMatch[1];
          const sandboxAuthError = await verifySandboxAuth(request, env, sessionId);
          if (!sandboxAuthError) {
            // Sandbox auth passed, continue to route handler
          } else {
            // Both HMAC and sandbox auth failed
            return applyCorsHeaders(sandboxAuthError, corsOrigin);
          }
        }
      } else {
        // Not a sandbox auth route, return HMAC auth error
        return applyCorsHeaders(hmacAuthError, corsOrigin);
      }
    }
  }

  // Find matching route
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = path.match(route.pattern);
    if (match) {
      try {
        const response = await route.handler(request, env, match);
        return applyCorsHeaders(response, corsOrigin);
      } catch (e) {
        console.error("Route handler error:", e);
        return applyCorsHeaders(error("Internal server error", 500), corsOrigin);
      }
    }
  }

  return applyCorsHeaders(error("Not found", 404), corsOrigin);
}
