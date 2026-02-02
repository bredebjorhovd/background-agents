import type { GitHubPort } from "../ports/github-port";
import type { RepositoryInfo, CreatePRRequest, CreatePRResponse } from "../ports/types";
import type { GitHubOAuthConfig } from "../auth/github";
import { decryptToken } from "../auth/crypto";
import {
  generateInstallationToken,
  listInstallationRepositories,
  type GitHubAppConfig,
} from "../auth/github-app";
import type { GitHubTokenResponse, GitHubUser } from "../types";
import type { InstallationRepository } from "@open-inspect/shared";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_OAUTH_URL = "https://github.com/login/oauth/access_token";

export class GitHubAdapter implements GitHubPort {
  constructor(
    private appConfig: GitHubAppConfig | null,
    private oauthConfig: GitHubOAuthConfig
  ) {}

  async exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
    const response = await fetch(GITHUB_OAUTH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: this.oauthConfig.clientId,
        client_secret: this.oauthConfig.clientSecret,
        code,
      }),
    });

    const data = (await response.json()) as GitHubTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if ("error" in data && data.error) {
      throw new Error(data.error_description ?? data.error);
    }

    return data;
  }

  async refreshAccessToken(refreshToken: string): Promise<GitHubTokenResponse> {
    const response = await fetch(GITHUB_OAUTH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: this.oauthConfig.clientId,
        client_secret: this.oauthConfig.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = (await response.json()) as GitHubTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if ("error" in data && data.error) {
      throw new Error(data.error_description ?? data.error);
    }

    return data;
  }

  async getCurrentUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json() as Promise<GitHubUser>;
  }

  async generateInstallationToken(installationId?: string): Promise<string> {
    if (!this.appConfig) {
      throw new Error("GitHub App config not configured");
    }
    const config = installationId ? { ...this.appConfig, installationId } : this.appConfig;
    return generateInstallationToken(config);
  }

  async createPullRequest(request: CreatePRRequest): Promise<CreatePRResponse> {
    const accessToken = await decryptToken(
      request.accessTokenEncrypted,
      this.oauthConfig.encryptionKey
    );

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${request.owner}/${request.repo}/pulls`,
      {
        method: "POST",
        headers: this.getApiHeaders(accessToken, true),
        body: JSON.stringify({
          title: request.title,
          body: request.body,
          head: request.head,
          base: request.base,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create PR: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      number: number;
      html_url: string;
      url: string;
      state: string;
    };

    return {
      number: data.number,
      url: data.url,
      htmlUrl: data.html_url,
      state: data.state,
    };
  }

  async getPullRequestByHead(
    accessToken: string,
    owner: string,
    repo: string,
    head: string
  ): Promise<CreatePRResponse | null> {
    const headParam = head.includes(":") ? head : `${owner}:${head}`;
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(headParam)}&state=open`,
      {
        headers: this.getApiHeaders(accessToken),
      }
    );

    if (!response.ok) {
      return null;
    }

    const pulls = (await response.json()) as Array<{
      number: number;
      html_url: string;
      url: string;
      state: string;
    }>;

    if (pulls.length === 0) {
      return null;
    }

    const pr = pulls[0];
    return {
      number: pr.number,
      url: pr.url,
      htmlUrl: pr.html_url,
      state: pr.state,
    };
  }

  async getRepository(accessToken: string, owner: string, repo: string): Promise<RepositoryInfo> {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get repository: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      default_branch: string;
      private: boolean;
      full_name: string;
    };

    return {
      defaultBranch: data.default_branch,
      private: data.private,
      fullName: data.full_name,
    };
  }

  async listInstallationRepositories(): Promise<InstallationRepository[]> {
    if (!this.appConfig) {
      throw new Error("GitHub App config not configured");
    }
    return listInstallationRepositories(this.appConfig);
  }

  async updatePullRequest(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
    updates: { title?: string; body?: string; state?: "open" | "closed" }
  ): Promise<void> {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}`, {
      method: "PATCH",
      headers: this.getApiHeaders(accessToken, true),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update PR: ${response.status} ${error}`);
    }
  }

  async addPRComment(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<void> {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: "POST",
        headers: this.getApiHeaders(accessToken, true),
        body: JSON.stringify({ body }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to add comment: ${response.status} ${error}`);
    }
  }

  async listUserRepositories(
    accessToken: string,
    perPage: number = 100
  ): Promise<
    Array<{
      id: number;
      fullName: string;
      owner: string;
      name: string;
      private: boolean;
      defaultBranch: string;
    }>
  > {
    const response = await fetch(`${GITHUB_API_BASE}/user/repos?per_page=${perPage}&sort=updated`, {
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list repositories: ${response.status} ${error}`);
    }

    const repos = (await response.json()) as Array<{
      id: number;
      full_name: string;
      owner: { login: string };
      name: string;
      private: boolean;
      default_branch: string;
    }>;

    return repos.map((repoInfo) => ({
      id: repoInfo.id,
      fullName: repoInfo.full_name,
      owner: repoInfo.owner.login,
      name: repoInfo.name,
      private: repoInfo.private,
      defaultBranch: repoInfo.default_branch,
    }));
  }

  async getUserEmails(
    accessToken: string
  ): Promise<Array<{ email: string; primary: boolean; verified: boolean }>> {
    const response = await fetch(`${GITHUB_API_BASE}/user/emails`, {
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json() as Promise<
      Array<{ email: string; primary: boolean; verified: boolean }>
    >;
  }

  private getApiHeaders(accessToken: string, includeJson: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Open-Inspect",
    };

    if (includeJson) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }
}
