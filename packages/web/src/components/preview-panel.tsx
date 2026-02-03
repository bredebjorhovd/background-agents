"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Artifact } from "@/types/session";

export interface SelectedElementInfo {
  selector: string;
  tagName: string;
  react?: { name: string; props?: Record<string, unknown> };
  text?: string;
  viewport?: { width: number; height: number; devicePixelRatio?: number };
}

interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreviewPanelProps {
  artifacts: Artifact[];
  sessionId: string;
  onSelectElement?: (element: SelectedElementInfo) => void;
}

const HOVER_THROTTLE_MS = 60;

export function PreviewPanel({ artifacts, sessionId, onSelectElement }: PreviewPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectLoading, setSelectLoading] = useState(false);
  const [hoveredRect, setHoveredRect] = useState<BoundingRect | null>(null);
  const [hoveredElement, setHoveredElement] = useState<SelectedElementInfo | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number } | null>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const hoverThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRequestIdRef = useRef(0);
  const hoverPointRef = useRef<{ x: number; y: number } | null>(null);
  const remoteViewportRef = useRef<{ width: number; height: number } | null>(null);

  // Find the preview artifact
  const previewArtifact = artifacts.find((a) => a.type === "preview");
  const previewUrl = previewArtifact?.url;
  const hoveredLabel =
    hoveredElement?.react?.name ??
    hoveredElement?.tagName ??
    hoveredElement?.selector ??
    (hoveredRect ? "Unknown element" : null);

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
    setError("Failed to load preview. The dev server may not be running.");
  }, []);

  const fetchElementAtPoint = useCallback(
    async (
      x: number,
      y: number,
      viewportWidth: number,
      viewportHeight: number
    ): Promise<{ element?: SelectedElementInfo; boundingRect?: BoundingRect; error?: string }> => {
      const deviceScaleFactor =
        typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
          ? window.devicePixelRatio
          : undefined;
      const res = await fetch(`/api/sessions/${sessionId}/element-at-point`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x,
          y,
          viewportWidth,
          viewportHeight,
          url: previewUrl ?? undefined,
          deviceScaleFactor,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error || "Request failed" };
      const rect = data?.element?.boundingRect;
      return {
        element: data?.element,
        boundingRect:
          rect &&
          typeof rect.x === "number" &&
          typeof rect.y === "number" &&
          typeof rect.width === "number" &&
          typeof rect.height === "number"
            ? (rect as BoundingRect)
            : undefined,
      };
    },
    [sessionId, previewUrl]
  );

  const handleHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelecting || !iframeContainerRef.current) return;
      const container = iframeContainerRef.current;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const viewportWidth = Math.round(rect.width);
      const viewportHeight = Math.round(rect.height);
      if (viewportWidth <= 0 || viewportHeight <= 0) return;
      hoverPointRef.current = { x, y };

      if (hoverThrottleRef.current !== null) return;
      hoverThrottleRef.current = setTimeout(() => {
        hoverThrottleRef.current = null;
        const requestId = ++hoverRequestIdRef.current;
        const remoteViewport = remoteViewportRef.current;
        const scaleX =
          remoteViewport && remoteViewport.width > 0 ? remoteViewport.width / viewportWidth : 1;
        const scaleY =
          remoteViewport && remoteViewport.height > 0 ? remoteViewport.height / viewportHeight : 1;
        const scaledX = x * scaleX;
        const scaledY = y * scaleY;
        fetchElementAtPoint(scaledX, scaledY, viewportWidth, viewportHeight).then((result) => {
          if (requestId !== hoverRequestIdRef.current) return;
          if (result.element?.viewport?.width && result.element?.viewport?.height) {
            remoteViewportRef.current = {
              width: result.element.viewport.width,
              height: result.element.viewport.height,
            };
          }
          if (result.boundingRect) {
            const responseViewport = result.element?.viewport;
            const responseScaleX =
              responseViewport && responseViewport.width > 0
                ? viewportWidth / responseViewport.width
                : 1;
            const responseScaleY =
              responseViewport && responseViewport.height > 0
                ? viewportHeight / responseViewport.height
                : 1;
            const localPoint = hoverPointRef.current;
            const width = result.boundingRect.width * responseScaleX;
            const height = result.boundingRect.height * responseScaleY;
            const translateX =
              localPoint?.x !== undefined ? localPoint.x - scaledX * responseScaleX : 0;
            const translateY =
              localPoint?.y !== undefined ? localPoint.y - scaledY * responseScaleY : 0;
            const x = result.boundingRect.x * responseScaleX + translateX;
            const y = result.boundingRect.y * responseScaleY + translateY;
            setHoveredRect({ x, y, width, height });
            setHoveredElement(result.element ?? null);
            setHoveredPoint(hoverPointRef.current);
          } else {
            setHoveredRect(null);
            setHoveredElement(null);
            setHoveredPoint(null);
          }
        });
      }, HOVER_THROTTLE_MS);
    },
    [isSelecting, fetchElementAtPoint]
  );

  const handleSelectClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelecting || !iframeContainerRef.current || !onSelectElement) return;
      const container = iframeContainerRef.current;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const viewportWidth = Math.round(rect.width);
      const viewportHeight = Math.round(rect.height);
      const remoteViewport = remoteViewportRef.current;
      const scaleX =
        remoteViewport && remoteViewport.width > 0 ? remoteViewport.width / viewportWidth : 1;
      const scaleY =
        remoteViewport && remoteViewport.height > 0 ? remoteViewport.height / viewportHeight : 1;
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      setSelectLoading(true);
      setHoveredRect(null);
      setHoveredElement(null);
      setHoveredPoint(null);
      try {
        const result = await fetchElementAtPoint(scaledX, scaledY, viewportWidth, viewportHeight);
        if (result.element) {
          if (result.element.viewport?.width && result.element.viewport?.height) {
            remoteViewportRef.current = {
              width: result.element.viewport.width,
              height: result.element.viewport.height,
            };
          }
          onSelectElement(result.element);
          setIsSelecting(false);
        } else {
          setError(result?.error || "Could not get element");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setSelectLoading(false);
      }
    },
    [isSelecting, onSelectElement, fetchElementAtPoint]
  );

  // Reset loading state when URL changes
  useEffect(() => {
    if (previewUrl) {
      setIsLoading(true);
      setError(null);
    }
  }, [previewUrl]);

  // Clear hover highlight when leaving select mode
  useEffect(() => {
    if (!isSelecting) {
      setHoveredRect(null);
      setHoveredElement(null);
      setHoveredPoint(null);
      remoteViewportRef.current = null;
    }
  }, [isSelecting]);

  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <GlobeIcon className="w-12 h-12 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">No preview available</h3>
        <p className="text-sm text-center max-w-md">
          Ask the agent to start a preview using the{" "}
          <code className="px-1.5 py-0.5 bg-muted rounded text-xs">start-preview</code> tool, or run
          a dev server on port 5173.
        </p>
        <div className="mt-6 text-xs text-secondary-foreground">
          <p>Example prompts:</p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>&quot;Start a preview of the app&quot;</li>
            <li>&quot;Run the dev server and show me the preview&quot;</li>
            <li>&quot;Set up the project and start a live preview&quot;</li>
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
          <GlobeIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground truncate">{previewUrl}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onSelectElement && (
            <button
              type="button"
              onClick={() => setIsSelecting((s) => !s)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded transition-colors ${
                isSelecting
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
              title={isSelecting ? "Click an element in the preview" : "Select a React component"}
            >
              <CursorIcon className="w-4 h-4" />
              {isSelecting ? "Click element…" : "Select"}
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Refresh preview"
          >
            <RefreshIcon className="w-4 h-4 text-muted-foreground" />
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Open in new tab"
          >
            <ExternalLinkIcon className="w-4 h-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      {/* Preview iframe container */}
      <div ref={iframeContainerRef} className="flex-1 relative bg-white">
        {isSelecting && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center cursor-crosshair"
            style={{ backgroundColor: "rgba(0,0,0,0.04)" }}
            onClick={handleSelectClick}
            onMouseMove={handleHover}
            onMouseLeave={() => {
              setHoveredRect(null);
              setHoveredElement(null);
              setHoveredPoint(null);
            }}
            onKeyDown={(e) => e.key === "Escape" && setIsSelecting(false)}
            role="button"
            tabIndex={0}
            aria-label="Click an element in the preview to select it"
          >
            {hoveredRect && (
              <>
                <div
                  className="absolute z-30 pointer-events-none rounded border-2 border-blue-500 bg-blue-500/15 shadow-md ring-2 ring-blue-400/30"
                  style={{
                    left: hoveredRect.x,
                    top: hoveredRect.y,
                    width: Math.max(0, hoveredRect.width),
                    height: Math.max(0, hoveredRect.height),
                  }}
                  aria-hidden
                />
                {hoveredLabel && (
                  <div
                    className="absolute z-30 pointer-events-none max-w-[240px] px-2 py-0.5 text-[11px] font-medium bg-blue-600 text-white rounded shadow-md whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{
                      left: (hoveredPoint?.x ?? hoveredRect.x) + 10,
                      top: Math.max(0, (hoveredPoint?.y ?? hoveredRect.y) - 26),
                    }}
                  >
                    {hoveredLabel}
                  </div>
                )}
              </>
            )}
            <span className="px-3 py-1.5 text-sm font-medium bg-background/95 text-foreground rounded-md shadow-lg border border-border pointer-events-none">
              {selectLoading ? "Getting element…" : "Click any element to select it"}
            </span>
          </div>
        )}
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
              <span className="text-sm text-muted-foreground">Loading preview...</span>
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
          src={previewUrl}
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
          title="Live Preview"
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-muted bg-muted/30 text-xs text-secondary-foreground">
        <span>Session: {sessionId.slice(0, 8)}...</span>
        <span>
          {previewArtifact?.metadata?.previewStatus === "outdated" ? (
            <span className="text-amber-600 dark:text-amber-400">Preview may be outdated</span>
          ) : (
            <span className="text-success">Live</span>
          )}
        </span>
      </div>
    </div>
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

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777L13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
      />
    </svg>
  );
}
