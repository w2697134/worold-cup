import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import type { ValueOutcome } from "@/lib/types";

export const runtime = "nodejs";

interface PaperBet {
  id: string;
  createdAt: string;
  matchId: string;
  outcome: ValueOutcome;
  odds: number;
  stake: number;
  modelProbability?: number;
  closingOdds?: number;
  clv?: number;
  clvNote: string;
  note?: string;
}

interface PaperBetBody {
  matchId?: unknown;
  outcome?: unknown;
  odds?: unknown;
  stake?: unknown;
  modelProbability?: unknown;
  closingOdds?: unknown;
  note?: unknown;
}

const DATA_FILE = path.join(process.cwd(), "data", "paper-bets.jsonl");

export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get("matchId");
  const limit = clamp(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1, 200);
  const bets = (await readBets())
    .filter((bet) => !matchId || bet.matchId === matchId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return NextResponse.json({
    bets,
    count: bets.length,
    latest: bets[0] ?? null,
    clvNote: "CLV uses odds / closingOdds - 1; positive means the recorded price beat the closing price.",
  });
}

export async function POST(req: NextRequest) {
  let body: PaperBetBody;
  try {
    body = (await req.json()) as PaperBetBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  const outcome = parseOutcome(body.outcome);
  const odds = parseDecimalOdds(body.odds);
  const stake = parsePositiveNumber(body.stake, 1);
  const modelProbability = parseProbability(body.modelProbability);
  const closingOdds = body.closingOdds === undefined ? undefined : parseDecimalOdds(body.closingOdds);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : undefined;

  if (!matchId) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }
  if (!outcome) {
    return NextResponse.json({ error: "outcome must be home, draw, or away" }, { status: 400 });
  }
  if (!odds) {
    return NextResponse.json({ error: "odds must be decimal odds between 1.01 and 50" }, { status: 400 });
  }
  if (!stake) {
    return NextResponse.json({ error: "stake must be a positive number" }, { status: 400 });
  }
  if (body.closingOdds !== undefined && !closingOdds) {
    return NextResponse.json(
      { error: "closingOdds must be decimal odds between 1.01 and 50" },
      { status: 400 },
    );
  }

  const bet = withClv({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    matchId,
    outcome,
    odds,
    stake,
    modelProbability,
    closingOdds,
    clvNote: "",
    note,
  });

  await appendBet(bet);
  return NextResponse.json({ bet }, { status: 201 });
}

async function readBets(): Promise<PaperBet[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return withClv(JSON.parse(line) as PaperBet);
        } catch {
          return null;
        }
      })
      .filter((bet): bet is PaperBet => Boolean(bet));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function appendBet(bet: PaperBet): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.appendFile(DATA_FILE, `${JSON.stringify(bet)}\n`, "utf8");
}

function withClv(bet: PaperBet): PaperBet {
  if (!bet.closingOdds) {
    return {
      ...bet,
      clv: undefined,
      clvNote: "closingOdds not recorded; CLV is pending.",
    };
  }

  const clv = round4(bet.odds / bet.closingOdds - 1);
  return {
    ...bet,
    clv,
    clvNote:
      clv > 0
        ? "Positive CLV: recorded odds beat the closing price."
        : clv < 0
          ? "Negative CLV: closing price was better than the recorded odds."
          : "Flat CLV: recorded odds matched the closing price.",
  };
}

function parseOutcome(value: unknown): ValueOutcome | undefined {
  return value === "home" || value === "draw" || value === "away" ? value : undefined;
}

function parseDecimalOdds(value: unknown): number | undefined {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 1.01 || numberValue > 50) {
    return undefined;
  }
  return round4(numberValue);
}

function parsePositiveNumber(value: unknown, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;
  return round4(numberValue);
}

function parseProbability(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return undefined;
  if (numberValue > 1 && numberValue <= 100) return round4(numberValue / 100);
  if (numberValue <= 1) return round4(numberValue);
  return undefined;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
