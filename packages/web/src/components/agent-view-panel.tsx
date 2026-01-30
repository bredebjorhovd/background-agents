"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface StreamFrame {
  frameNumber: number;
  frameHash: string;
  timestamp: number;
  imageData: string;
  imageType: "jpeg" | "png";
  width: number;
  height: number;
}

interface AgentViewPanelProps {
  sessionId: string;
  latestFrame: StreamFrame | null;
  isStreaming: boolean;
}

export function AgentViewPanel({ sessionId, latestFrame, isStreaming }: AgentViewPanelProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [frameHistory, setFrameHistory] = useState<StreamFrame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<StreamFrame | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Add frames to history (keep last 50)
  useEffect(() => {
    if (latestFrame && !isPaused) {
      setFrameHistory((prev) => {
        const newHistory = [...prev, latestFrame].slice(-50);
        return newHistory;
      });
      setSelectedFrame(latestFrame);
    }
  }, [latestFrame, isPaused]);

  // Draw the selected frame on canvas
  useEffect(() => {
    if (!selectedFrame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/${selectedFrame.imageType};base64,${selectedFrame.imageData}`;
  }, [selectedFrame]);

  const handleTogglePause = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  if (!isStreaming && !latestFrame) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <MonitorIcon className="w-12 h-12 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">Agent View not active</h3>
        <p className="text-sm text-center max-w-md">
          Ask the agent to start the screenshot stream using the{" "}
          <code className="px-1.5 py-0.5 bg-muted rounded text-xs">start-stream</code> tool. This
          will show real-time screenshots of the agent&apos;s work.
        </p>
        <div className="mt-6 text-xs text-secondary-foreground">
          <p>Example prompts:</p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>&quot;Start streaming your view&quot;</li>
            <li>&quot;Let me watch what you&apos;re doing&quot;</li>
            <li>&quot;Show me the screen&quot;</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-muted bg-muted/30">
        <div className="flex items-center gap-2">
          <MonitorIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Agent View</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${isPaused ? "bg-amber-500" : "bg-success animate-pulse"}`}
              />
              {isPaused ? "Paused" : "Live"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePause}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? (
              <PlayIcon className="w-4 h-4 text-muted-foreground" />
            ) : (
              <PauseIcon className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {selectedFrame && (
            <span className="text-xs text-secondary-foreground">
              Frame #{selectedFrame.frameNumber}
            </span>
          )}
        </div>
      </div>

      {/* Main canvas area */}
      <div className="flex-1 relative bg-[#1a1a1a] overflow-auto">
        <div className="flex items-center justify-center min-h-full p-4">
          {selectedFrame ? (
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full border border-border rounded shadow-lg"
              style={{ imageRendering: "auto" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <LoadingIcon className="w-8 h-8 animate-spin" />
              <span className="text-sm">Waiting for frames...</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline scrubber */}
      {frameHistory.length > 1 && (
        <div className="border-t border-border-muted bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary-foreground w-16">Timeline</span>
            <div className="flex-1 flex gap-1 overflow-x-auto py-1">
              {frameHistory.map((frame) => (
                <button
                  key={frame.frameNumber}
                  onClick={() => setSelectedFrame(frame)}
                  className={`w-12 h-8 flex-shrink-0 rounded overflow-hidden border transition-all ${
                    selectedFrame?.frameNumber === frame.frameNumber
                      ? "border-accent ring-1 ring-accent"
                      : "border-border hover:border-muted-foreground"
                  }`}
                  title={`Frame #${frame.frameNumber} - ${formatTime(frame.timestamp)}`}
                >
                  <img
                    src={`data:image/${frame.imageType};base64,${frame.imageData}`}
                    alt={`Frame ${frame.frameNumber}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
            <span className="text-xs text-secondary-foreground w-20 text-right">
              {frameHistory.length} frames
            </span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-muted bg-muted/30 text-xs text-secondary-foreground">
        <span>Session: {sessionId.slice(0, 8)}...</span>
        {selectedFrame && (
          <span>
            {selectedFrame.width}x{selectedFrame.height} • {formatTime(selectedFrame.timestamp)}
          </span>
        )}
      </div>
    </div>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 2v4m0 12v4m4.93-14.93l-2.83 2.83m-8.2 8.2l-2.83 2.83m14.83 0l-2.83-2.83m-8.2-8.2L4.07 4.07M22 12h-4M6 12H2"
      />
    </svg>
  );
}
