/**
 * Session-related validation schemas.
 */

import { z } from "zod";
import { MODEL_SCHEMA } from "./common";

/**
 * Request to create a new session.
 */
export const CreateSessionRequestSchema = z
  .object({
    repoOwner: z
      .string()
      .min(1, "Repository owner is required")
      .max(39, "Repository owner must be 39 characters or fewer")
      .regex(/^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, "Invalid GitHub owner name"),
    repoName: z
      .string()
      .min(1, "Repository name is required")
      .max(100, "Repository name must be 100 characters or fewer")
      .regex(/^(?!.*\.\.)(?!.*\.git$)[a-zA-Z0-9._-]+$/, "Invalid repository name"),
    title: z
      .string()
      .max(200)
      .transform((value) => value.trim())
      .optional(),
    model: MODEL_SCHEMA.optional(),
  })
  .strict();

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/**
 * Request to send a prompt to a session.
 */
export const SessionPromptRequestSchema = z
  .object({
    content: z.string().min(1, "Prompt content is required"),
    model: MODEL_SCHEMA.optional(),
    attachments: z
      .array(
        z.object({
          type: z.enum(["file", "image", "url"]),
          name: z.string(),
          url: z.string().url().optional(),
          content: z.string().optional(),
          mimeType: z.string().optional(),
        })
      )
      .optional(),
  })
  .strict();

export type SessionPromptRequest = z.infer<typeof SessionPromptRequestSchema>;

/**
 * Request to update session metadata.
 */
export const UpdateSessionRequestSchema = z
  .object({
    title: z
      .string()
      .max(200)
      .transform((value) => value.trim())
      .optional(),
  })
  .strict();

export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequestSchema>;
