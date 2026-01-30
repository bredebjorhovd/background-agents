"use client";

import type { Artifact } from "@/types/session";

interface ArtifactsSectionProps {
  artifacts: Artifact[];
}

export function ArtifactsSection({ artifacts }: ArtifactsSectionProps) {
  if (artifacts.length === 0) return null;

  return (
    <div className="space-y-3">
      {artifacts.map((a) => {
        if (a.type === "pr") {
          const prNumber = a.metadata?.prNumber;
          const prUrl = a.url;
          return (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <GitHubPrIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              {prUrl ? (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline truncate"
                >
                  PR #{prNumber ?? "link"}
                </a>
              ) : (
                <span className="text-foreground">PR #{prNumber}</span>
              )}
            </div>
          );
        }
        if (a.type === "screenshot") {
          return (
            <div key={a.id} className="space-y-1">
              <span className="text-xs text-muted-foreground block">Screenshot</span>
              <a
                href={a.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded border border-border overflow-hidden hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <img
                  src={a.url ?? ""}
                  alt="Screenshot"
                  className="w-full max-h-40 object-cover object-top"
                  loading="lazy"
                />
              </a>
            </div>
          );
        }
        if (a.type === "preview") {
          return (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <GlobeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <a
                href={a.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline truncate"
              >
                Live preview
              </a>
              {a.metadata?.previewStatus === "outdated" && (
                <span className="text-xs text-amber-600 dark:text-amber-400">(outdated)</span>
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function GitHubPrIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}
