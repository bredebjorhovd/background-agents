/**
 * Pull request-related validation schemas.
 */

import { z } from "zod";

/**
 * Request to create a pull request from the session's branch.
 */
export const CreatePRRequestSchema = z
  .object({
    title: z.string().min(1, "PR title is required").max(200),
    body: z.string().optional(),
    targetBranch: z.string().optional(), // Defaults to repo's default branch
    draft: z.boolean().optional().default(false),
  })
  .strict();

export type CreatePRRequest = z.infer<typeof CreatePRRequestSchema>;
