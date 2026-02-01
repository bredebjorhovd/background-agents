/**
 * Repository route handlers.
 * Handles repository listing and metadata management.
 */

import type { Env } from "../types";
import { getGitHubAppConfig, listInstallationRepositories } from "../auth/github-app";
import type {
  EnrichedRepository,
  InstallationRepository,
  RepoMetadata,
} from "@open-inspect/shared";
import { getRepoMetadataKey } from "../utils/repo";
import { json, error } from "./helpers";

/**
 * Cached repos list structure.
 */
interface CachedReposList {
  repos: EnrichedRepository[];
  cachedAt: string;
}

/**
 * List all repositories accessible via the GitHub App installation.
 * Results are cached in KV for 5 minutes to avoid rate limits.
 * GET /repos
 */
export async function handleListRepos(
  request: Request,
  env: Env,
  _match: RegExpMatchArray
): Promise<Response> {
  const CACHE_KEY = "repos:list";
  const CACHE_TTL = 300; // 5 minutes

  // Check KV cache first
  try {
    const cached = (await env.SESSION_INDEX.get(CACHE_KEY, "json")) as CachedReposList | null;
    if (cached) {
      return json({
        repos: cached.repos,
        cached: true,
        cachedAt: cached.cachedAt,
      });
    }
  } catch (e) {
    console.warn("Failed to read repos cache:", e);
  }

  // Get GitHub App config
  const appConfig = getGitHubAppConfig(env);
  if (!appConfig) {
    return error("GitHub App not configured", 500);
  }

  // Fetch repositories from GitHub App installation
  let repos: InstallationRepository[];
  try {
    repos = await listInstallationRepositories(appConfig);
  } catch (e) {
    console.error("Failed to list installation repositories:", e);
    return error("Failed to fetch repositories from GitHub", 500);
  }

  // Enrich repos with stored metadata
  const enrichedRepos: EnrichedRepository[] = await Promise.all(
    repos.map(async (repo) => {
      const newKey = getRepoMetadataKey(repo.owner, repo.name);
      const oldKey = `repo:metadata:${repo.fullName}`; // Original casing for migration

      try {
        let metadata = (await env.SESSION_INDEX.get(newKey, "json")) as RepoMetadata | null;

        // Migration: check old key pattern if metadata not found at new key
        if (!metadata && repo.fullName.toLowerCase() !== newKey.replace("repo:metadata:", "")) {
          metadata = (await env.SESSION_INDEX.get(oldKey, "json")) as RepoMetadata | null;
          if (metadata) {
            // Migrate to new key
            await env.SESSION_INDEX.put(newKey, JSON.stringify(metadata));
            await env.SESSION_INDEX.delete(oldKey);
            console.log(`Migrated metadata from ${oldKey} to ${newKey}`);
          }
        }

        return metadata ? { ...repo, metadata } : repo;
      } catch {
        return repo;
      }
    })
  );

  // Cache the results
  const cachedAt = new Date().toISOString();
  const cacheData: CachedReposList = {
    repos: enrichedRepos,
    cachedAt,
  };

  try {
    await env.SESSION_INDEX.put(CACHE_KEY, JSON.stringify(cacheData), {
      expirationTtl: CACHE_TTL,
    });
  } catch (e) {
    console.warn("Failed to cache repos list:", e);
  }

  return json({
    repos: enrichedRepos,
    cached: false,
    cachedAt,
  });
}

/**
 * Update metadata for a specific repository.
 * This allows storing custom descriptions, aliases, and channel associations.
 * PUT /repos/:owner/:name/metadata
 */
export async function handleUpdateRepoMetadata(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const owner = match.groups?.owner;
  const name = match.groups?.name;

  if (!owner || !name) {
    return error("Owner and name are required");
  }

  const body = (await request.json()) as RepoMetadata;

  // Validate and clean the metadata structure (remove undefined fields)
  const metadata = Object.fromEntries(
    Object.entries({
      description: body.description,
      aliases: Array.isArray(body.aliases) ? body.aliases : undefined,
      channelAssociations: Array.isArray(body.channelAssociations)
        ? body.channelAssociations
        : undefined,
      keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
    }).filter(([, v]) => v !== undefined)
  ) as RepoMetadata;

  const metadataKey = getRepoMetadataKey(owner, name);

  try {
    await env.SESSION_INDEX.put(metadataKey, JSON.stringify(metadata));

    // Invalidate the repos cache so next fetch includes updated metadata
    await env.SESSION_INDEX.delete("repos:list");

    // Return normalized repo identifier
    const normalizedRepo = `${owner.toLowerCase()}/${name.toLowerCase()}`;
    return json({
      status: "updated",
      repo: normalizedRepo,
      metadata,
    });
  } catch (e) {
    console.error("Failed to update repo metadata:", e);
    return error("Failed to update metadata", 500);
  }
}

/**
 * Get metadata for a specific repository.
 * GET /repos/:owner/:name/metadata
 */
export async function handleGetRepoMetadata(
  request: Request,
  env: Env,
  match: RegExpMatchArray
): Promise<Response> {
  const owner = match.groups?.owner;
  const name = match.groups?.name;

  if (!owner || !name) {
    return error("Owner and name are required");
  }

  const metadataKey = getRepoMetadataKey(owner, name);
  const normalizedRepo = `${owner.toLowerCase()}/${name.toLowerCase()}`;

  try {
    const metadata = (await env.SESSION_INDEX.get(metadataKey, "json")) as RepoMetadata | null;

    if (!metadata) {
      return json({
        repo: normalizedRepo,
        metadata: null,
      });
    }

    return json({
      repo: normalizedRepo,
      metadata,
    });
  } catch (e) {
    console.error("Failed to get repo metadata:", e);
    return error("Failed to get metadata", 500);
  }
}
