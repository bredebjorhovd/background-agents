/**
 * Participant route handlers.
 * Handles session participant management.
 */

import type { Env } from "../types";
import { error, getSessionStub } from "./helpers";

/**
 * Get session participants.
 * GET /sessions/:id/participants
 */
export async function handleSessionParticipants(
  _request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const stub = getSessionStub(env, match);
  if (!stub) return error("Session ID required");

  return stub.fetch(new Request("http://internal/internal/participants"));
}

/**
 * Add a participant to the session.
 * POST /sessions/:id/participants
 */
export async function handleAddParticipant(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const sessionId = match.groups?.id;
  if (!sessionId) return error("Session ID required");

  const body = await request.json();

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const response = await stub.fetch(
    new Request("http://internal/internal/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

  return response;
}
