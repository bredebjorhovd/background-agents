/**
 * GitHub authentication utilities.
 */

import { encryptToken } from "./crypto";
import type { GitHubUser, GitHubTokenResponse } from "../types";

/**
 * GitHub OAuth configuration.
 */
export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
}

/**
 * GitHub token with metadata.
 */
export interface StoredGitHubToken {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  expiresAt: number | null;
  scope: string;
}

/**
 * Store encrypted GitHub tokens.
 */
export async function encryptGitHubTokens(
  tokens: GitHubTokenResponse,
  encryptionKey: string
): Promise<StoredGitHubToken> {
  const accessTokenEncrypted = await encryptToken(tokens.access_token, encryptionKey);

  const refreshTokenEncrypted = tokens.refresh_token
    ? await encryptToken(tokens.refresh_token, encryptionKey)
    : null;

  const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;

  return {
    accessTokenEncrypted,
    refreshTokenEncrypted,
    expiresAt,
    scope: tokens.scope,
  };
}

/**
 * Generate noreply email for users with private email.
 */
export function generateNoreplyEmail(githubUser: GitHubUser): string {
  return `${githubUser.id}+${githubUser.login}@users.noreply.github.com`;
}

/**
 * Get best email for git commit attribution.
 */
export function getCommitEmail(
  githubUser: GitHubUser,
  emails?: Array<{ email: string; primary: boolean; verified: boolean }>
): string {
  // Use public email if available
  if (githubUser.email) {
    return githubUser.email;
  }

  // Use primary verified email from list
  if (emails) {
    const primary = emails.find((e) => e.primary && e.verified);
    if (primary) {
      return primary.email;
    }
  }

  // Fall back to noreply
  return generateNoreplyEmail(githubUser);
}
