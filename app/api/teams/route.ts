import { NextResponse } from "next/server";
import { TEAMS } from "@/lib/data";

// GET /api/teams  ->  Team[]
// Team roster used by the fixture mapper and prediction UI.
export async function GET() {
  return NextResponse.json({ teams: TEAMS });
}
