import { NextRequest, NextResponse } from "next/server";
import {
  authenticateToken,
  isDatabaseConfigured,
  readPredictionState,
  writePredictionState,
} from "@/lib/server-db";
import type { Prediction } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PredictionBody {
  activeMatchId?: string | null;
  predictionCache?: Record<string, Prediction>;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await readPredictionState(auth.id));
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  let body: PredictionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  await writePredictionState(auth.id, {
    activeMatchId: typeof body.activeMatchId === "string" ? body.activeMatchId : null,
    predictionCache:
      body.predictionCache && typeof body.predictionCache === "object" && !Array.isArray(body.predictionCache)
        ? body.predictionCache
        : {},
  });
  return NextResponse.json({ ok: true });
}

async function requireUser(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return await authenticateToken(token);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
