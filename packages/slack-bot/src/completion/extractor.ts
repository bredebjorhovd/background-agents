/**
 * Extract and aggregate agent response from control-plane events.
 */

import type {
  Env,
  EventResponse,
  ListEventsResponse,
  AgentResponse,
  ToolCallSummary,
  ArtifactInfo,
} from "../types";
import { generateInternalToken } from "../utils/internal";

/**
 * Tool names to include in summary display.
 */
export const SUMMARY_TOOL_NAMES = ["Edit", "Write", "Bash", "Grep", "Read"] as const;

// Server-side limit for events API
const EVENTS_PAGE_LIMIT = 200;

/** Control plane artifacts API response shape. */
interface ArtifactsApiResponse {
  artifacts: Array<{
    id: string;
    type: string;
    url: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: number;
  }>;
}

/**
 * Map artifact type and metadata to display label.
 */
function artifactToInfo(
  type: string,
  url: string,
  metadata?: Record<string, unknown> | null
): ArtifactInfo {
  let label: string;
  if (type === "pr") {
    const prNum = metadata?.number;
    label = prNum ? `PR #${prNum}` : "Pull Request";
  } else if (type === "branch") {
    label = `Branch: ${metadata?.name ?? "branch"}`;
  } else if (type === "screenshot") {
    label = "Screenshot";
  } else if (type === "preview") {
    label = "Live preview";
  } else {
    label = type;
  }
  return { type, url, label };
}

/**
 * Fetch session artifacts from the control plane (screenshots, preview, PRs, branches).
 * These are stored in the artifacts table; events API does not include them.
 */
async function fetchSessionArtifacts(env: Env, sessionId: string): Promise<ArtifactInfo[]> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (env.INTERNAL_CALLBACK_SECRET) {
      const authToken = await generateInternalToken(env.INTERNAL_CALLBACK_SECRET);
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const url = `https://internal/sessions/${sessionId}/artifacts`;
    const response = await env.CONTROL_PLANE.fetch(url, { headers });

    if (!response.ok) {
      console.error(`Failed to fetch artifacts: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as ArtifactsApiResponse;
    const artifacts = data.artifacts ?? [];

    return artifacts
      .filter((a) => a.url)
      .map((a) => artifactToInfo(a.type, a.url!, a.metadata ?? undefined));
  } catch (error) {
    console.error("Error fetching session artifacts:", error);
    return [];
  }
}

/**
 * Fetch events for a message and aggregate them into a response.
 *
 * Events are filtered by messageId directly - the control-plane associates
 * all events (tokens, tool_calls, etc.) with our internal messageId when storing.
 */
export async function extractAgentResponse(
  env: Env,
  sessionId: string,
  messageId: string
): Promise<AgentResponse> {
  try {
    // Build auth headers
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (env.INTERNAL_CALLBACK_SECRET) {
      const authToken = await generateInternalToken(env.INTERNAL_CALLBACK_SECRET);
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    // Fetch all events for this message, paginating if necessary
    const allEvents: EventResponse[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(`https://internal/sessions/${sessionId}/events`);
      url.searchParams.set("message_id", messageId);
      url.searchParams.set("limit", String(EVENTS_PAGE_LIMIT));
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await env.CONTROL_PLANE.fetch(url.toString(), { headers });

      if (!response.ok) {
        console.error(`Failed to fetch events: ${response.status}`);
        return { textContent: "", toolCalls: [], artifacts: [], success: false };
      }

      const data = (await response.json()) as ListEventsResponse;
      allEvents.push(...data.events);
      cursor = data.hasMore ? data.cursor : undefined;
    } while (cursor);

    // Get the final text from the last token event
    // Token events contain cumulative text (not incremental deltas), so we only need the last one
    const tokenEvents = allEvents
      .filter((e): e is EventResponse & { type: "token" } => e.type === "token")
      .sort((a, b) => {
        const timeDiff = (a.createdAt as number) - (b.createdAt as number);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id); // Stable secondary sort
      });
    const lastToken = tokenEvents[tokenEvents.length - 1];
    const textContent = lastToken ? String(lastToken.data.content ?? "") : "";

    // Extract tool calls
    const toolCalls: ToolCallSummary[] = allEvents
      .filter((e) => e.type === "tool_call")
      .map((e) => summarizeToolCall(e.data));

    // Extract artifacts from events (fallback; screenshots/preview come from API)
    const eventArtifacts: ArtifactInfo[] = allEvents
      .filter((e) => e.type === "artifact" && e.data.url)
      .map((e) =>
        artifactToInfo(
          String(e.data.artifactType ?? "unknown"),
          String(e.data.url),
          e.data.metadata as Record<string, unknown> | undefined
        )
      );

    // Fetch artifacts from API (screenshots, preview, PRs, branches) - source of truth
    const apiArtifacts = await fetchSessionArtifacts(env, sessionId);
    const artifacts = apiArtifacts.length > 0 ? apiArtifacts : eventArtifacts;

    // Check for completion event to get success status
    const completionEvent = allEvents.find((e) => e.type === "execution_complete");

    return {
      textContent,
      toolCalls,
      artifacts,
      success: Boolean(completionEvent?.data.success),
    };
  } catch (error) {
    console.error("Error extracting agent response:", error);
    return { textContent: "", toolCalls: [], artifacts: [], success: false };
  }
}

/**
 * Summarize a tool call for display.
 */
function summarizeToolCall(data: Record<string, unknown>): ToolCallSummary {
  const tool = String(data.tool ?? "Unknown");
  const args = (data.args ?? {}) as Record<string, unknown>;

  switch (tool) {
    case "Read":
      return { tool, summary: `Read ${args.file_path ?? "file"}` };
    case "Edit":
      return { tool, summary: `Edited ${args.file_path ?? "file"}` };
    case "Write":
      return { tool, summary: `Created ${args.file_path ?? "file"}` };
    case "Bash": {
      const cmd = String(args.command ?? "").slice(0, 40);
      return { tool, summary: `Ran: ${cmd}${cmd.length >= 40 ? "..." : ""}` };
    }
    case "Grep":
      return { tool, summary: `Searched for "${args.pattern ?? ""}"` };
    default:
      return { tool, summary: `Used ${tool}` };
  }
}
