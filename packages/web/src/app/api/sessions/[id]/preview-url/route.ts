import { NextResponse } from "next/server";
import { controlPlaneFetch } from "@/lib/control-plane";

/**
 * GET /api/sessions/[id]/preview-url
 * Proxies to control plane for the live preview tunnel URL.
 * This is the source of truth (from sandbox table), not artifacts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  try {
    const response = await controlPlaneFetch(`/sessions/${sessionId}/preview-url`);

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(err, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[preview-url]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
