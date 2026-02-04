/**
 * MessageQueue implementation.
 */

import type { MessageQueue } from "./types";
import type { MessageRepository, ParticipantRepository } from "../repository/types";
import type { PromptCommand } from "../types";

interface MessageQueueDependencies {
  messageRepo: MessageRepository;
  participantRepo: ParticipantRepository;
  getSession: () => { model?: string } | null;
  /** Returns true if the command was sent to the sandbox, false if sandbox not connected. */
  sendToSandbox: (command: PromptCommand) => Promise<boolean>;
  spawnIfNeeded: () => Promise<void>;
}

/**
 * Create a MessageQueue instance.
 */
export function createMessageQueue(deps: MessageQueueDependencies): MessageQueue {
  const { messageRepo, participantRepo, getSession, sendToSandbox, spawnIfNeeded } = deps;

  const shouldForceStartPreview = (content: string): boolean => {
    const trimmed = content.trim().toLowerCase();
    if (!trimmed) return false;
    if (trimmed.includes("start-preview")) return true;
    if (trimmed.startsWith("start preview")) return true;
    if (trimmed.startsWith("restart preview")) return true;
    if (trimmed.startsWith("start the preview")) return true;
    if (trimmed.startsWith("restart the preview")) return true;
    return (
      /^(please\s+)?(start|restart|run|launch|open)\b/.test(trimmed) &&
      /\b(preview|dev server|devserver)\b/.test(trimmed)
    );
  };

  const rewriteForStartPreview = (content: string): string => {
    const lower = content.toLowerCase();
    const wants5173 = lower.includes("5173");
    const avoid8080 = lower.includes("8080") && lower.includes("dont");
    const portHint = wants5173
      ? "Use port 5173."
      : "Default to port 5173. Avoid port 8080 unless the user explicitly requests it.";
    const avoidHint = avoid8080 ? "Do NOT use port 8080." : "";

    return [
      "You must immediately call the `start-preview` tool for this request.",
      "Do NOT run bash/run_command to start a dev server.",
      "Do NOT inspect code or files for this request.",
      portHint,
      avoidHint,
      "",
      `User request: ${content.trim()}`,
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n");
  };

  return {
    async enqueue(data: {
      content: string;
      authorId: string;
      source: string;
      attachments?: Array<{ type: string; name: string; url?: string }>;
      callbackContext?: {
        channel: string;
        threadTs: string;
        repoFullName: string;
        model: string;
      };
    }): Promise<string> {
      const messageId = crypto.randomUUID();
      const now = Date.now();

      messageRepo.create({
        id: messageId,
        authorId: data.authorId,
        content: data.content,
        source: data.source,
        attachments: data.attachments ? JSON.stringify(data.attachments) : null,
        callbackContext: data.callbackContext ? JSON.stringify(data.callbackContext) : null,
        createdAt: now,
      });

      return messageId;
    },

    async processQueue(): Promise<void> {
      try {
        // Check if there's already a message being processed
        const processing = messageRepo.getProcessing();
        if (processing) {
          return;
        }

        // Get the next pending message (FIFO)
        const nextMessage = messageRepo.getNextPending();
        if (!nextMessage) {
          return;
        }

        // Spawn sandbox if needed (before sending)
        await spawnIfNeeded();

        // Get author information
        const author = participantRepo.getById(nextMessage.author_id);

        // Get session for default model
        const session = getSession();

        // Build prompt command with model and attachments
        const forceStartPreview = shouldForceStartPreview(nextMessage.content);
        const commandContent = forceStartPreview
          ? rewriteForStartPreview(nextMessage.content)
          : nextMessage.content;
        const command: PromptCommand = {
          type: "prompt",
          messageId: nextMessage.id,
          content: commandContent,
          model: nextMessage.model || session?.model || "claude-haiku-4-5",
          toolPolicy: forceStartPreview
            ? {
                mode: "allowlist",
                allowedTools: ["start-preview"],
                reason: "preview",
              }
            : undefined,
          author: {
            userId: author?.user_id ?? "unknown",
            githubName: author?.github_name ?? null,
            githubEmail: author?.github_email ?? null,
          },
          attachments: nextMessage.attachments ? JSON.parse(nextMessage.attachments) : undefined,
        };

        // Send command to sandbox; only mark as processing if actually sent (sandbox connected)
        const sent = await sendToSandbox(command);
        if (sent) {
          messageRepo.updateStatus(nextMessage.id, "processing", {
            startedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error("Failed to process message queue:", error);
      }
    },
  };
}
