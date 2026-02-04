import { NextResponse } from "next/server";
import { controlPlaneFetch } from "@/lib/control-plane";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  try {
    const response = await controlPlaneFetch(`/sessions/${sessionId}/stop`, {
      method: "POST",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(err, { status: response.status });
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch (error) {
    console.error("[stop-session]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
