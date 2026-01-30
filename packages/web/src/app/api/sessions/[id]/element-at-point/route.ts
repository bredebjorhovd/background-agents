import { NextResponse } from "next/server";
import { controlPlaneFetch } from "@/lib/control-plane";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  let body: {
    x: number;
    y: number;
    viewportWidth?: number;
    viewportHeight?: number;
  };
  try {
    body = await _request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { x, y, viewportWidth, viewportHeight } = body;
  if (typeof x !== "number" || typeof y !== "number") {
    return NextResponse.json({ error: "x and y (numbers) required" }, { status: 400 });
  }

  const payload: { x: number; y: number; viewportWidth?: number; viewportHeight?: number } = {
    x,
    y,
  };
  if (typeof viewportWidth === "number" && typeof viewportHeight === "number") {
    payload.viewportWidth = viewportWidth;
    payload.viewportHeight = viewportHeight;
  }

  try {
    const response = await controlPlaneFetch(`/sessions/${sessionId}/element-at-point`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(err, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[element-at-point]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
