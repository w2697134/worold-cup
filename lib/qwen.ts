// ============================================================================
// QWEN / DASHSCOPE INTELLIGENCE CLIENT
// ----------------------------------------------------------------------------
// Server-side helper for future match-intelligence extraction. This module only
// reads secrets from env and never exposes API keys to the browser.
// ============================================================================

export type QwenRole = "system" | "user" | "assistant";

export type QwenContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface QwenChatMessage {
  role: QwenRole;
  content: string | QwenContentPart[];
}

export interface QwenConfigStatus {
  configured: boolean;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  searchEnabled: boolean;
}

interface QwenChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  expectJson?: boolean;
  enableSearch?: boolean;
  searchStrategy?: "standard" | "pro" | "agent" | "agent_max";
}

interface QwenChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_TEXT_MODEL = "qwen-plus";
const DEFAULT_VISION_MODEL = "qwen-vl-plus";

export function hasQwenKey(): boolean {
  return Boolean(process.env.DASHSCOPE_API_KEY);
}

export function getQwenConfigStatus(): QwenConfigStatus {
  return {
    configured: hasQwenKey(),
    baseUrl: getBaseUrl(),
    textModel: getTextModel(),
    visionModel: getVisionModel(),
    searchEnabled: parseBoolean(process.env.QWEN_SEARCH_ENABLED),
  };
}

export async function callQwenJson<T = unknown>(
  messages: QwenChatMessage[],
  options: QwenChatOptions = {},
): Promise<T> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

  let res: Response;
  try {
    res = await fetch(`${trimTrailingSlash(getBaseUrl())}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? getTextModel(),
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1200,
        ...(options.enableSearch
          ? {
              enable_search: true,
              ...(options.searchStrategy ? { search_strategy: options.searchStrategy } : {}),
            }
          : {}),
        ...(options.expectJson === false
          ? {}
          : { response_format: { type: "json_object" } }),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qwen HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as QwenChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseJson<T>(content);
}

function getBaseUrl(): string {
  return process.env.DASHSCOPE_BASE_URL ?? DEFAULT_BASE_URL;
}

function getTextModel(): string {
  return process.env.QWEN_TEXT_MODEL ?? process.env.QWEN_MODEL ?? DEFAULT_TEXT_MODEL;
}

function getVisionModel(): string {
  return process.env.QWEN_VISION_MODEL ?? DEFAULT_VISION_MODEL;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseJson<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1)) as T;
    }
    throw new Error("Qwen returned non-JSON content");
  }
}
