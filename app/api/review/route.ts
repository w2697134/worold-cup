import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "@/lib/fixtures";
import { reviewMatch, summarize } from "@/lib/review";
import type { Match } from "@/lib/types";

interface ReviewRequestBody {
  matchId?: unknown;
}

// POST /api/review
// body: { matchId? }
// Reviews finished matches with final scores against the deterministic baseline.
export async function POST(req: NextRequest) {
  let body: ReviewRequestBody;

  try {
    body = await readBody(req);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.matchId !== undefined && typeof body.matchId !== "string") {
    return NextResponse.json({ error: "matchId must be a string" }, { status: 400 });
  }

  const matches = await getMatches();
  const targets = selectReviewTargets(matches, body.matchId);

  if (body.matchId && targets.length === 0) {
    const match = matches.find((item) => item.id === body.matchId);

    if (!match) {
      return NextResponse.json({ error: "unknown matchId" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "match is not finished with a final score" },
      { status: 409 },
    );
  }

  try {
    const results = targets.map(reviewMatch);

    return NextResponse.json({
      results,
      summary: summarize(results),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "review failed" },
      { status: 500 },
    );
  }
}

async function readBody(req: NextRequest): Promise<ReviewRequestBody> {
  const raw = await req.text();
  if (!raw.trim()) return {};

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid review body");
  }

  return parsed as ReviewRequestBody;
}

function selectReviewTargets(matches: Match[], matchId?: string): Match[] {
  const reviewable = matches.filter((match) => match.status === "finished" && match.result);

  if (!matchId) return reviewable;

  return reviewable.filter((match) => match.id === matchId);
}
