/**
 * Linear integration validation schemas.
 */

import { z } from "zod";

/**
 * Request to link a Linear issue to a session.
 */
export const LinkTaskRequestSchema = z
  .object({
    issueId: z.string().min(1, "Linear issue ID is required"),
    teamId: z.string().min(1, "Linear team ID is required"),
  })
  .strict();

export type LinkTaskRequest = z.infer<typeof LinkTaskRequestSchema>;

/**
 * Request to unlink a Linear issue from a session.
 */
export const UnlinkTaskRequestSchema = z.object({}).strict();

export type UnlinkTaskRequest = z.infer<typeof UnlinkTaskRequestSchema>;

/**
 * Query parameters for listing Linear issues.
 */
export const ListIssuesQuerySchema = z.object({
  teamId: z.string().optional(),
  filter: z.enum(["all", "active", "backlog", "completed"]).optional().default("active"),
});

export type ListIssuesQuery = z.infer<typeof ListIssuesQuerySchema>;
