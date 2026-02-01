/**
 * Request validation middleware using Zod schemas.
 */

import type { z } from "zod";

/**
 * Standard error response format.
 */
interface ErrorResponse {
  error: string;
  details?: unknown;
}

/**
 * Create an error response.
 */
function errorResponse(message: string, status: number, details?: unknown): Response {
  const body: ErrorResponse = { error: message };
  if (details) {
    body.details = details;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Validate request body against a Zod schema.
 *
 * Returns the validated and typed data if successful,
 * or an error Response if validation fails.
 *
 * @example
 * ```typescript
 * const result = await validateBody(request, CreateSessionRequestSchema);
 * if (result instanceof Response) {
 *   return result; // Validation error
 * }
 * // result is now typed as CreateSessionRequest
 * const { repoOwner, repoName } = result;
 * ```
 */
export async function validateBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T | Response> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0];
      const path = firstError.path.join(".");
      const message = path ? `${path}: ${firstError.message}` : firstError.message;

      return errorResponse(`Validation error: ${message}`, 400, result.error.issues);
    }

    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("Invalid JSON body", 400);
    }
    return errorResponse("Failed to parse request body", 400);
  }
}

/**
 * Validate query parameters against a Zod schema.
 *
 * Returns the validated and typed data if successful,
 * or an error Response if validation fails.
 *
 * @example
 * ```typescript
 * const result = validateQuery(request, PaginationSchema);
 * if (result instanceof Response) {
 *   return result; // Validation error
 * }
 * const { limit, cursor } = result;
 * ```
 */
export function validateQuery<T>(request: Request, schema: z.ZodSchema<T>): T | Response {
  try {
    const url = new URL(request.url);
    const params: Record<string, string> = {};

    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }

    const result = schema.safeParse(params);

    if (!result.success) {
      const firstError = result.error.issues[0];
      const path = firstError.path.join(".");
      const message = path ? `${path}: ${firstError.message}` : firstError.message;

      return errorResponse(`Query validation error: ${message}`, 400, result.error.issues);
    }

    return result.data;
  } catch {
    return errorResponse("Failed to parse query parameters", 400);
  }
}

/**
 * Validate path parameters against a Zod schema.
 *
 * Returns the validated and typed data if successful,
 * or an error Response if validation fails.
 *
 * @example
 * ```typescript
 * const result = validateParams({ sessionId }, SessionIdSchema);
 * if (result instanceof Response) {
 *   return result; // Validation error
 * }
 * const { sessionId } = result;
 * ```
 */
export function validateParams<T>(
  params: Record<string, string | undefined>,
  schema: z.ZodSchema<T>
): T | Response {
  const result = schema.safeParse(params);

  if (!result.success) {
    const firstError = result.error.issues[0];
    const path = firstError.path.join(".");
    const message = path ? `${path}: ${firstError.message}` : firstError.message;

    return errorResponse(`Path validation error: ${message}`, 400, result.error.issues);
  }

  return result.data;
}
