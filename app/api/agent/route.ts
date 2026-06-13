import { NextRequest, NextResponse } from "next/server";
import { getTeamName } from "@/lib/data";
import {
  createKnowledgeId,
  normalizeKnowledgeItems,
} from "@/lib/knowledge";
import { requireApiUser } from "@/lib/server-auth";
import type { KnowledgeCategory, KnowledgeItem, KnowledgeReliability, Match } from "@/lib/types";

export const dynamic = "force-dynamic";

type ChatRole = "user" | "assistant";

interface AgentRequest {
  message?: string;
  history?: { role: ChatRole; content: string }[];
  selectedMatch?: Match | null;
  knowledgeItems?: KnowledgeItem[];
}

interface AgentActionUpdate {
  id: string;
  title?: string;
  category?: KnowledgeCategory;
  content?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  reliability?: KnowledgeReliability;
}

interface AgentResponseShape {
  reply?: string;
  actions?: {
    addItems?: Partial<KnowledgeItem>[];
    updateItems?: AgentActionUpdate[];
    deleteItemIds?: string[];
    compile?: boolean;
  };
}

const CATEGORY_SET = new Set<KnowledgeCategory>([
  "team_news",
  "injury",
  "lineup",
  "tactics",
  "weather",
  "travel",
  "form",
  "history",
  "market",
  "other",
]);

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const message = cleanText(body.message, 1600);
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const selectedMatch = body.selectedMatch ?? null;
  const knowledgeItems = normalizeKnowledgeItems(body.knowledgeItems);
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  const errors: unknown[] = [];
  for (const model of getAgentModelCandidates()) {
    try {
      const raw = await runModelAgent({ message, history, selectedMatch, knowledgeItems, model });
      return NextResponse.json(normalizeAgentResponse(raw, selectedMatch, knowledgeItems, model));
    } catch (error) {
      errors.push(error);
    }
  }

  const fallback = buildLocalFallback(message, selectedMatch, knowledgeItems);
  return NextResponse.json({
    ...fallback,
    model: "基础模式",
    warning: friendlyModelError(errors[errors.length - 1]),
  });
}

async function runModelAgent({
  message,
  history,
  selectedMatch,
  knowledgeItems,
  model,
}: {
  message: string;
  history: { role: ChatRole; content: string }[];
  selectedMatch: Match | null;
  knowledgeItems: KnowledgeItem[];
  model: string;
}): Promise<AgentResponseShape> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const system = [
    "你是这个网页里的全局桌宠 Agent，名字叫「小赛」。",
    "你必须用简体中文、短句、低信息密度回答。不要讨好用户；不确定就直接说不确定。",
    "你熟悉项目：这是 2026 世界杯预测工具。主页面包含赛程、比赛卡片、预测抽屉、模型复盘、知识库、策略说明。知识库按主页面选中的比赛生效；没选中比赛就是 not found。",
    "后端预测使用 DeepSeek；联网搜索情报使用 DashScope/Qwen；知识库整理会把情报压缩成预测上下文。不要泄露或猜测 API key。",
    "你可以帮助用户导入、修改、删除知识库情报，但只能基于用户明确给出的事实或已有知识库内容，不要编造伤停、赔率、比分、首发。",
    "如果用户要入库/导入/保存情报，且 selectedMatch 为 null，只回复 not found：先在主页面点一场比赛，不要返回动作。",
    "如果用户只是问项目问题，只回答，不要返回知识库动作。",
    "只输出合法 JSON，不要 markdown。JSON 结构：",
    '{ "reply": "中文回复", "actions": { "addItems": [], "updateItems": [], "deleteItemIds": [], "compile": true } }',
    "addItems 每条只填 title/category/content/sourceLabel/sourceUrl/reliability；category 必须是 team_news, injury, lineup, tactics, weather, travel, form, history, market, other 之一。",
    "修改已有情报时必须引用已有 item id；不确定要改哪条就提问，不要猜。",
  ].join("\n");

  const context = JSON.stringify({
    selectedMatch: selectedMatch
      ? {
          id: selectedMatch.id,
          match: `${getTeamName(selectedMatch.home)} 对 ${getTeamName(selectedMatch.away)}`,
          stage: selectedMatch.stage,
          date: selectedMatch.date,
          kickoff: selectedMatch.kickoff,
          status: selectedMatch.status,
        }
      : null,
    existingKnowledge: knowledgeItems.slice(0, 30).map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      content: item.content.slice(0, 420),
      reliability: item.reliability,
      sourceUrl: item.sourceUrl,
    })),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          ...history.map((entry) => ({
            role: entry.role,
            content: cleanText(entry.content, 900),
          })),
          {
            role: "user",
            content: ["当前项目状态：", context, "用户消息：", message].join("\n"),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.25,
        max_tokens: 1600,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Agent HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return parseJson(data.choices?.[0]?.message?.content ?? "");
}

function normalizeAgentResponse(
  raw: AgentResponseShape,
  selectedMatch: Match | null,
  existing: KnowledgeItem[],
  model: string,
) {
  const reply = cleanText(raw.reply, 600) || "我没理解，换个说法。";
  const actionInput = raw.actions ?? {};
  const scope = selectedMatch
    ? `${getTeamName(selectedMatch.home)} 对 ${getTeamName(selectedMatch.away)}`
    : "not found";

  const addItems = selectedMatch
    ? normalizeKnowledgeItems(
        (actionInput.addItems ?? []).map((item) => ({
          ...item,
          id: createKnowledgeId(),
          scope,
          matchId: selectedMatch.id,
          reliability: normalizeReliability(item.reliability),
          category: normalizeCategory(item.category),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      )
    : [];

  const existingIds = new Set(existing.map((item) => item.id));
  const updateItems = (actionInput.updateItems ?? [])
    .filter((item) => item.id && existingIds.has(item.id))
    .map((item) => ({
      id: item.id,
      title: cleanText(item.title, 120) || undefined,
      category: normalizeCategory(item.category),
      content: cleanText(item.content, 1400) || undefined,
      sourceLabel: cleanText(item.sourceLabel, 80) || undefined,
      sourceUrl: normalizeUrl(item.sourceUrl),
      reliability: normalizeReliability(item.reliability),
    }));

  const deleteItemIds = (actionInput.deleteItemIds ?? []).filter((id) => existingIds.has(id));
  const hasAction = addItems.length > 0 || updateItems.length > 0 || deleteItemIds.length > 0;

  return {
    reply,
    model,
    actions: {
      addItems,
      updateItems,
      deleteItemIds,
      compile: Boolean(actionInput.compile ?? hasAction),
    },
  };
}

function buildLocalFallback(
  message: string,
  selectedMatch: Match | null,
  existing: KnowledgeItem[],
): ReturnType<typeof normalizeAgentResponse> {
  if (/入库|导入|保存|添加|记到|写进|加入/.test(message)) {
    if (!selectedMatch) {
      return {
        reply: "not found：先在主页面点一场比赛。",
        model: "local-fallback",
        actions: { addItems: [], updateItems: [], deleteItemIds: [], compile: false },
      };
    }

    return normalizeAgentResponse(
      {
        reply: "模型接口没接通，我先按原文入库。需要更细分类时再让我整理。",
        actions: {
          addItems: [
            {
              title: buildTitle(message),
              category: inferCategory(message),
              content: message,
              sourceUrl: extractFirstUrl(message),
              reliability: "mid",
            },
          ],
          compile: true,
        },
      },
      selectedMatch,
      existing,
      "local-fallback",
    );
  }

  if (/怎么用|项目|功能|页面|预测|知识库|复盘|策略|桌宠|agent|当前比赛|选中/.test(message)) {
    return {
      reply: buildProjectAnswer(message, selectedMatch),
      model: "local-fallback",
      actions: { addItems: [], updateItems: [], deleteItemIds: [], compile: false },
    };
  }

  return {
    reply:
      "我可以回答这个项目的用法，也可以把你给的赛前情报导入当前比赛知识库。现在模型接口没接通，所以复杂问答会受限。",
    model: "local-fallback",
    actions: { addItems: [], updateItems: [], deleteItemIds: [], compile: false },
  };
}

function buildProjectAnswer(message: string, selectedMatch: Match | null): string {
  if (/当前比赛|选中/.test(message)) {
    return selectedMatch
      ? `当前选中：${getTeamName(selectedMatch.home)} 对 ${getTeamName(selectedMatch.away)}。知识库会写到这场。`
      : "not found：主页面还没选中比赛。";
  }

  if (/知识库/.test(message)) {
    return "知识库跟随主页面选中的比赛。你可以点比赛卡片选中，再让我把情报入库；入库后会自动整理给预测使用。";
  }

  if (/复盘/.test(message)) {
    return "模型复盘会拿已完赛样本对比预测结果，主要看胜平负命中、比分命中和 Brier。样本少时别过度相信。";
  }

  if (/策略/.test(message)) {
    return "策略说明展示预测参考逻辑，比如强弱、盘口、交锋、近期状态。它是解释框架，不等于事实情报。";
  }

  if (/桌宠|agent/.test(message)) {
    return "我现在是全局浮动桌宠。能回答项目问题，也能把你粘贴的赛前情报导入当前比赛知识库。";
  }

  return "这个项目主要流程：先在赛程点一场比赛，再用知识库联网或让我导入情报，最后点预测。复盘用于检查历史预测表现。";
}

function getAgentModelCandidates(): string[] {
  const values = [
    process.env.AGENT_MODEL,
    process.env.DEEPSEEK_AGENT_MODEL,
    process.env.DEEPSEEK_MODEL,
    "flash",
  ]
    .map(normalizeModelAlias)
    .filter(Boolean);

  return Array.from(new Set(values));
}

function normalizeModelAlias(value: string | undefined): string {
  const text = cleanText(value, 80);
  if (!text) return "";
  if (/^(?:4(?:\.0)?\s*-?\s*)?flash$/i.test(text)) return "flash";
  return text;
}

function parseJson(content: string): AgentResponseShape {
  try {
    return JSON.parse(content) as AgentResponseShape;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1)) as AgentResponseShape;
    }
    throw new Error("Agent returned non-JSON content");
  }
}

function normalizeCategory(value: unknown): KnowledgeCategory {
  return CATEGORY_SET.has(value as KnowledgeCategory) ? (value as KnowledgeCategory) : "other";
}

function normalizeReliability(value: unknown): KnowledgeReliability {
  return value === "high" || value === "low" ? value : "mid";
}

function inferCategory(text: string): KnowledgeCategory {
  if (/赔率|盘口|欧指|亚指|让球|水位|竞彩/.test(text)) return "market";
  if (/伤停|受伤|缺阵|停赛|injur|suspend|out\b/i.test(text)) return "injury";
  if (/首发|阵容|名单|替补|lineup|squad/i.test(text)) return "lineup";
  if (/天气|温度|降雨|风|weather/i.test(text)) return "weather";
  if (/交锋|历史|h2h|head[- ]to[- ]head/i.test(text)) return "history";
  if (/近期|战绩|连胜|不胜|状态|form/i.test(text)) return "form";
  if (/战术|阵型|打法|压迫|反击|tactic/i.test(text)) return "tactics";
  return "other";
}

function buildTitle(text: string): string {
  return cleanText(text.replace(/https?:\/\/\S+/g, ""), 24) || "桌宠导入";
}

function extractFirstUrl(text: string): string | undefined {
  return normalizeUrl(text.match(/https?:\/\/[^\s，。；、)）]+/i)?.[0]);
}

function normalizeUrl(value: unknown): string | undefined {
  const text = cleanText(value, 600);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").trim().slice(0, limit);
}

function friendlyModelError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/model|404|400/i.test(raw)) {
    return "agent 模型暂时不可用，已用基础模式处理。";
  }
  if (/API_KEY|not configured/i.test(raw)) return "agent 后端密钥未配置。";
  if (/timeout|aborted|network|fetch/i.test(raw)) return "agent 请求超时或网络失败。";
  return raw || "agent 请求失败。";
}
