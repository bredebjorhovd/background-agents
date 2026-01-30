"use client";

import { useState, useEffect, useCallback } from "react";
import type { Artifact } from "@/types/session";

interface VSCodePanelProps {
  artifacts: Artifact[];
  sessionId: string;
}

// Port 8080 is used for code-server
const CODE_SERVER_PORT = 8080;

export function VSCodePanel({ artifacts, sessionId }: VSCodePanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Find the VS Code URL from preview artifact's tunnel_urls metadata (port 8080).
  // Must be a distinct URL from the preview (port 5173) — same URL means tunnel for 8080 wasn't stored.
  const previewArtifact = artifacts.find((a) => a.type === "preview");
  const tunnelUrls = previewArtifact?.metadata?.tunnelUrls as Record<string, string> | undefined;
  const previewUrl = previewArtifact?.url ?? null;
  const vscodeUrlRaw = tunnelUrls?.[String(CODE_SERVER_PORT)] ?? tunnelUrls?.["8080"] ?? null;
  const vscodeUrl = vscodeUrlRaw && vscodeUrlRaw !== previewUrl ? vscodeUrlRaw : null;

  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
    setIsLoading(true);
    setError(null);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setError("Failed to load VS Code. Ask the agent to run the start-vscode tool.");
  }, []);

  // Reset loading state when URL changes
  useEffect(() => {
    if (vscodeUrl) {
      setIsLoading(true);
      setError(null);
    }
  }, [vscodeUrl]);

  if (!vscodeUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <CodeIcon className="w-12 h-12 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">VS Code not started</h3>
        <p className="text-sm text-center max-w-md">
          Ask the agent to start VS Code using the{" "}
          <code className="px-1.5 py-0.5 bg-muted rounded text-xs">start-vscode</code> tool. VS Code
          runs on port 8080 (a different URL than the preview on 5173).
        </p>
        <div className="mt-6 text-xs text-secondary-foreground">
          <p>Example prompts:</p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>&quot;Start VS Code so I can edit files&quot;</li>
            <li>&quot;Open the code editor&quot;</li>
            <li>&quot;Launch code-server&quot;</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-muted bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <CodeIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground">VS Code</span>
          <span className="text-xs text-secondary-foreground truncate">
            (port {CODE_SERVER_PORT})
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleRefresh}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Refresh VS Code"
          >
            <RefreshIcon className="w-4 h-4 text-muted-foreground" />
          </button>
          <a
            href={vscodeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Open in new tab"
          >
            <ExternalLinkIcon className="w-4 h-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      {/* VS Code iframe container */}
      <div className="flex-1 relative bg-[#1e1e1e]">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
              <span className="text-sm text-muted-foreground">Loading VS Code...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <AlertIcon className="w-10 h-10 text-red-500 opacity-70" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 text-sm bg-accent text-accent-foreground hover:bg-accent/90 rounded transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Iframe */}
        <iframe
          key={iframeKey}
          src={vscodeUrl}
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
          allow="clipboard-read; clipboard-write"
          title="VS Code"
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-muted bg-[#007acc] text-white text-xs">
        <span>Session: {sessionId.slice(0, 8)}...</span>
        <span className="flex items-center gap-1">
          <SyncIcon className="w-3 h-3" />
          Synced with sandbox
        </span>
      </div>
    </div>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 16 16">
      <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
      <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
    </svg>
  );
}
