/**
 * Common validation schemas shared across endpoints.
 */

import { z } from "zod";

/**
 * Valid LLM model identifiers.
 */
export const MODEL_SCHEMA = z.enum(["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5"]);

/**
 * Pagination parameters.
 */
export const PAGINATION_SCHEMA = z.object({
  limit: z.number().int().positive().max(100).optional().default(50),
  cursor: z.string().optional(),
});

/**
 * GitHub repository identifier.
 */
export const REPO_IDENTIFIER_SCHEMA = z.object({
  repoOwner: z.string().min(1, "Repository owner is required"),
  repoName: z.string().min(1, "Repository name is required"),
});

/**
 * Session ID parameter.
 */
export const SESSION_ID_SCHEMA = z.string().uuid("Invalid session ID format");

/**
 * User ID parameter.
 */
export const USER_ID_SCHEMA = z.string().min(1, "User ID is required");

/**
 * Non-empty string.
 */
export const NON_EMPTY_STRING = z.string().min(1);
