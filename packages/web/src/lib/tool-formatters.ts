import type { FileChange } from "@/types/session";

export interface SandboxEvent {
  type: string;
  content?: string;
  messageId?: string;
  tool?: string;
  args?: Record<string, unknown>;
  callId?: string;
  result?: string;
  error?: string;
  success?: boolean;
  status?: string;
  output?: string;
  sha?: string;
  timestamp: number;
}

/** Tool names that reference a file path in args (lowercase for case-insensitive match) */
const FILE_TOOL_NAMES = new Set(["read", "edit", "write", "read_file", "edit_file", "write_file"]);

function countLines(s: string | undefined): number {
  if (s == null || typeof s !== "string") return 0;
  return s.split(/\r?\n/).length;
}

/**
 * Extract unique file paths from Read/Edit/Write tool_call events for the right sidebar.
 * Uses args.filePath or args.file_path (OpenCode may send either).
 * Matches tool name case-insensitively (OpenCode may send "read" or "Read").
 * For Edit events, computes additions/deletions from oldString/newString line counts.
 */
export function extractFilesChanged(events: SandboxEvent[]): FileChange[] {
  const byPath = new Map<string, { additions: number; deletions: number }>();
  for (const event of events) {
    if (event.type !== "tool_call" || !event.tool) continue;
    const toolLower = (event.tool as string).toLowerCase();
    if (!FILE_TOOL_NAMES.has(toolLower)) continue;
    const path =
      (event.args?.filePath as string | undefined) ?? (event.args?.file_path as string | undefined);
    if (!path) continue;
    const existing = byPath.get(path) ?? { additions: 0, deletions: 0 };
    if (toolLower === "edit" || toolLower === "edit_file") {
      const oldStr = (event.args?.oldString ?? event.args?.old_string) as string | undefined;
      const newStr = (event.args?.newString ?? event.args?.new_string) as string | undefined;
      existing.deletions += countLines(oldStr);
      existing.additions += countLines(newStr);
    }
    byPath.set(path, existing);
  }
  return Array.from(byPath.entries(), ([filename, { additions, deletions }]) => ({
    filename,
    additions,
    deletions,
  }));
}

/**
 * Extract just the filename from a file path
 */
function basename(filePath: string | undefined): string {
  if (!filePath) return "unknown";
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
function truncate(str: string | undefined, maxLen: number): string {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

export interface FormattedToolCall {
  /** Tool name for display */
  toolName: string;
  /** Short summary for collapsed view */
  summary: string;
  /** Icon name or null */
  icon: string | null;
  /** Full details for expanded view - returns JSX-safe content */
  getDetails: () => { args?: Record<string, unknown>; output?: string };
}

/**
 * Format a tool call event for compact display
 * Note: OpenCode uses camelCase field names (filePath, not file_path)
 */
export function formatToolCall(event: SandboxEvent): FormattedToolCall {
  const { tool, args, output } = event;
  const toolName = tool || "Unknown";

  switch (toolName) {
    case "Read": {
      // OpenCode uses filePath (camelCase)
      const filePath = (args?.filePath ?? args?.file_path) as string | undefined;
      const lineCount = countLines(output);
      return {
        toolName: "Read",
        summary: filePath
          ? `${basename(filePath)}${lineCount > 0 ? ` (${lineCount} lines)` : ""}`
          : "file",
        icon: "file",
        getDetails: () => ({ args, output }),
      };
    }

    case "Edit": {
      const filePath = (args?.filePath ?? args?.file_path) as string | undefined;
      return {
        toolName: "Edit",
        summary: filePath ? basename(filePath) : "file",
        icon: "pencil",
        getDetails: () => ({ args, output }),
      };
    }

    case "Write": {
      const filePath = (args?.filePath ?? args?.file_path) as string | undefined;
      return {
        toolName: "Write",
        summary: filePath ? basename(filePath) : "file",
        icon: "plus",
        getDetails: () => ({ args, output }),
      };
    }

    case "Bash": {
      const command = args?.command as string | undefined;
      return {
        toolName: "Bash",
        summary: truncate(command, 50),
        icon: "terminal",
        getDetails: () => ({ args, output }),
      };
    }

    case "Grep": {
      const pattern = args?.pattern as string | undefined;
      const matchCount = output ? countLines(output) : 0;
      return {
        toolName: "Grep",
        summary: pattern
          ? `"${truncate(pattern, 30)}"${matchCount > 0 ? ` (${matchCount} matches)` : ""}`
          : "search",
        icon: "search",
        getDetails: () => ({ args, output }),
      };
    }

    case "Glob": {
      const pattern = args?.pattern as string | undefined;
      const fileCount = output ? countLines(output) : 0;
      return {
        toolName: "Glob",
        summary: pattern
          ? `${truncate(pattern, 30)}${fileCount > 0 ? ` (${fileCount} files)` : ""}`
          : "search",
        icon: "folder",
        getDetails: () => ({ args, output }),
      };
    }

    case "Task": {
      const description = args?.description as string | undefined;
      const prompt = args?.prompt as string | undefined;
      return {
        toolName: "Task",
        summary: description ? truncate(description, 40) : prompt ? truncate(prompt, 40) : "task",
        icon: "box",
        getDetails: () => ({ args, output }),
      };
    }

    case "WebFetch": {
      const url = args?.url as string | undefined;
      return {
        toolName: "WebFetch",
        summary: url ? truncate(url, 40) : "url",
        icon: "globe",
        getDetails: () => ({ args, output }),
      };
    }

    case "WebSearch": {
      const query = args?.query as string | undefined;
      return {
        toolName: "WebSearch",
        summary: query ? `"${truncate(query, 40)}"` : "search",
        icon: "search",
        getDetails: () => ({ args, output }),
      };
    }

    case "TodoWrite":
    case "todo_write": {
      const todos = args?.todos as unknown[] | undefined;
      return {
        toolName: "TodoWrite",
        summary: todos ? `${todos.length} item${todos.length === 1 ? "" : "s"}` : "todos",
        icon: "file",
        getDetails: () => ({ args, output }),
      };
    }

    default:
      return {
        toolName,
        summary: args && Object.keys(args).length > 0 ? truncate(JSON.stringify(args), 50) : "",
        icon: null,
        getDetails: () => ({ args, output }),
      };
  }
}

/**
 * Get a compact summary for a group of tool calls
 */
export function formatToolGroup(events: SandboxEvent[]): {
  toolName: string;
  count: number;
  summary: string;
} {
  if (events.length === 0) {
    return { toolName: "Unknown", count: 0, summary: "" };
  }

  const toolName = events[0].tool || "Unknown";
  const count = events.length;

  // Build summary based on tool type
  switch (toolName) {
    case "Read": {
      const _files = events
        .map((e) => basename((e.args?.filePath ?? e.args?.file_path) as string | undefined))
        .filter(Boolean);
      return {
        toolName: "Read",
        count,
        summary: `${count} file${count === 1 ? "" : "s"}`,
      };
    }

    case "Edit": {
      return {
        toolName: "Edit",
        count,
        summary: `${count} file${count === 1 ? "" : "s"}`,
      };
    }

    case "Bash": {
      return {
        toolName: "Bash",
        count,
        summary: `${count} command${count === 1 ? "" : "s"}`,
      };
    }

    default:
      return {
        toolName,
        count,
        summary: `${count} call${count === 1 ? "" : "s"}`,
      };
  }
}
