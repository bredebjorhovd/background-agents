import { describe, it, expect } from "vitest";
import { decryptToken, generateEncryptionKey } from "./crypto";
import { encryptGitHubTokens, generateNoreplyEmail, getCommitEmail } from "./github";

describe("GitHub auth helpers", () => {
  it("encrypts GitHub tokens and preserves metadata", async () => {
    const encryptionKey = generateEncryptionKey();
    const tokens = {
      access_token: "access-123",
      refresh_token: "refresh-456",
      expires_in: 3600,
      scope: "repo",
      token_type: "bearer",
    };

    const stored = await encryptGitHubTokens(tokens, encryptionKey);
    const accessToken = await decryptToken(stored.accessTokenEncrypted, encryptionKey);
    const refreshToken = stored.refreshTokenEncrypted
      ? await decryptToken(stored.refreshTokenEncrypted, encryptionKey)
      : null;

    expect(accessToken).toBe("access-123");
    expect(refreshToken).toBe("refresh-456");
    expect(stored.scope).toBe("repo");
    expect(stored.expiresAt).not.toBeNull();
  });

  it("selects commit email with fallback", () => {
    const user = {
      id: 1,
      login: "octo",
      name: "Octo",
      email: null,
      avatar_url: "https://example.com",
    };

    const email = getCommitEmail(user, [
      { email: "secondary@example.com", primary: false, verified: true },
      { email: "primary@example.com", primary: true, verified: true },
    ]);

    expect(email).toBe("primary@example.com");
    expect(generateNoreplyEmail(user)).toBe("1+octo@users.noreply.github.com");
  });
});
