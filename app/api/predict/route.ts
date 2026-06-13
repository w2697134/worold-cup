import { NextRequest, NextResponse } from "next/server";
import { predictMatch } from "@/lib/predict";
import { predictWithDeepSeek, hasDeepSeekKey } from "@/lib/deepseek";
import { isPredictableMatch } from "@/lib/data";
import { getMatches } from "@/lib/fixtures";
import { requireApiUser } from "@/lib/server-auth";
import type { Match, PredictionStrategyConfig } from "@/lib/types";

// POST /api/predict
// body: { matchId }  OR  { home, away, matchId? }
// -> { prediction }
//
// Uses the DeepSeek engine when DEEPSEEK_API_KEY is configured; otherwise (or on
// any error) falls back to the deterministic stub. The chosen engine is reflected
// in prediction.source ("skill" | "stub").
export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  let body: {
    matchId?: string;
    home?: string;
    away?: string;
    knowledgeContext?: string;
    strategyConfig?: PredictionStrategyConfig;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { matchId } = body;
  let { home, away } = body;

  // Resolve a full Match object (needed for the model's context).
  const matches = await getMatches();
  let match: Match | undefined = matchId
    ? matches.find((m) => m.id === matchId)
    : undefined;

  if (!match) {
    if (matchId && (!home || !away)) {
      return NextResponse.json({ error: "unknown matchId" }, { status: 404 });
    }
    if (!home || !away) {
      return NextResponse.json(
        { error: "provide matchId, or both home and away team codes" },
        { status: 400 },
      );
    }
    match = {
      id: matchId ?? `${home}-${away}`,
      date: "",
      kickoff: "",
      stage: "友谊赛",
      venue: "",
      city: "",
      home,
      away,
      status: "upcoming",
    };
  }

  if (!isPredictableMatch(match)) {
    return NextResponse.json(
      { error: "这场暂时不能预测：球队未确定，或比赛已经开始/结束。" },
      { status: 409 },
    );
  }

  // Real engine first, stub as a safety net.
  if (hasDeepSeekKey()) {
    try {
      const prediction = await predictWithDeepSeek(
        match,
        body.knowledgeContext,
        body.strategyConfig,
      );
      return NextResponse.json({ prediction });
    } catch (e) {
      console.error("[predict] DeepSeek failed, falling back to stub:", e);
    }
  }

  try {
    const prediction = predictMatch(match, body.knowledgeContext, body.strategyConfig);
    return NextResponse.json({ prediction });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "prediction failed" },
      { status: 500 },
    );
  }
}
