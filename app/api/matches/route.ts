import { NextRequest, NextResponse } from "next/server";
import { getSchedule } from "@/lib/fixtures";
import { getChinaDateKey } from "@/lib/time";

// GET /api/matches            -> all matches + available dates
// GET /api/matches?date=YYYY-MM-DD -> matches for that day
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const schedule = await getSchedule();
  const matches = date
    ? schedule.matches.filter((match) => getChinaDateKey(match) === date)
    : schedule.matches;

  return NextResponse.json({ ...schedule, matches });
}
