import { NextRequest, NextResponse } from "next/server";
import {
  authenticateToken,
  isDatabaseConfigured,
  readKnowledgeState,
  writeKnowledgeState,
} from "@/lib/server-db";
import type { CompiledKnowledge, KnowledgeItem } from "@/lib/types";

export const dynamic = "force-dynamic";

interface KnowledgeBody {
  items?: KnowledgeItem[];
  compiled?: CompiledKnowledge | null;
  compiledScopeKey?: string | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await readKnowledgeState(auth.id));
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  let body: KnowledgeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  await writeKnowledgeState(auth.id, {
    items: Array.isArray(body.items) ? body.items : [],
    compiled: body.compiled ?? null,
    compiledScopeKey: typeof body.compiledScopeKey === "string" ? body.compiledScopeKey : null,
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
