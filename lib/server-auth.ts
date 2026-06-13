import { NextRequest, NextResponse } from "next/server";
import { authenticateToken, isDatabaseConfigured } from "@/lib/server-db";

export async function requireApiUser(req: NextRequest) {
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
