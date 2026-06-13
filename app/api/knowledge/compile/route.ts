import { NextRequest, NextResponse } from "next/server";
import {
  compileKnowledgeLocally,
  compileKnowledgeWithDeepSeek,
  normalizeKnowledgeItems,
} from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const items = normalizeKnowledgeItems(body.items);

  try {
    const compiled = await compileKnowledgeWithDeepSeek(items);
    return NextResponse.json({ items, compiled });
  } catch (error) {
    console.error("[knowledge/compile] DeepSeek failed, using local compiler:", error);
    return NextResponse.json({
      items,
      compiled: compileKnowledgeLocally(items),
      warning: error instanceof Error ? error.message : "knowledge compile failed",
    });
  }
}
