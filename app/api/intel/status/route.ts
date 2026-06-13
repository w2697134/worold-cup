import { NextResponse } from "next/server";
import { hasDeepSeekKey } from "@/lib/deepseek";
import { getQwenConfigStatus } from "@/lib/qwen";

export const dynamic = "force-dynamic";

export async function GET() {
  const qwen = getQwenConfigStatus();

  return NextResponse.json({
    deepseek: {
      configured: hasDeepSeekKey(),
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "flash",
      role: "prediction_generation",
    },
    qwen: {
      ...qwen,
      role: "future_intelligence_extraction",
    },
    liveSearch: {
      ready: qwen.configured && qwen.searchEnabled,
      enabledFlag: qwen.searchEnabled,
      adapter: "DashScope OpenAI-compatible chat completions with enable_search",
    },
  });
}
