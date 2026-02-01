/**
 * Participant-related validation schemas.
 */

import { z } from "zod";
import { USER_ID_SCHEMA } from "./common";

/**
 * Request to add a participant to a session.
 */
export const AddParticipantRequestSchema = z
  .object({
    userId: USER_ID_SCHEMA,
    role: z.enum(["owner", "member"]).optional().default("member"),
  })
  .strict();

export type AddParticipantRequest = z.infer<typeof AddParticipantRequestSchema>;

/**
 * Request to update participant role.
 */
export const UpdateParticipantRequestSchema = z
  .object({
    role: z.enum(["owner", "member"]),
  })
  .strict();

export type UpdateParticipantRequest = z.infer<typeof UpdateParticipantRequestSchema>;
