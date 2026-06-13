"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompiledKnowledge,
  KnowledgeCategory,
  KnowledgeItem,
  KnowledgeReliability,
  Match,
} from "@/lib/types";
import { getTeamName } from "@/lib/data";
import { appPath } from "@/lib/base-path";
import {
  ACTIVE_MATCH_EVENT,
  ACTIVE_MATCH_STORAGE_KEY,
  AUTH_SESSION_STORAGE_KEY,
  KNOWLEDGE_STORAGE_KEY,
  KNOWLEDGE_UPDATED_EVENT,
} from "@/lib/client-state";
import type { AuthUser } from "@/lib/client-state";

interface StoredKnowledge {
  items?: KnowledgeItem[];
  compiled?: CompiledKnowledge | null;
  compiledScopeKey?: string | null;
}

interface AgentUpdate {
  id: string;
  title?: string;
  category?: KnowledgeCategory;
  content?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  reliability?: KnowledgeReliability;
}

interface AgentActions {
  addItems?: KnowledgeItem[];
  updateItems?: AgentUpdate[];
  deleteItemIds?: string[];
  compile?: boolean;
}

interface AgentApiResponse {
  reply?: string;
  model?: string;
  warning?: string;
  actions?: AgentActions;
  error?: string;
}

type PetMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type PendingDelete =
  | { kind: "currentMatch"; matchId: string; matchLabel: string; count: number }
  | { kind: "ids"; ids: string[]; count: number };

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

export function AgentPet() {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeMatchId, setActiveMatchId] = useState("");
  const [messages, setMessages] = useState<PetMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(appPath("/api/matches"))
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { matches?: Match[] }) => setMatches(data.matches ?? []))
      .catch(() => setMatches([]));
  }, []);

  useEffect(() => {
    function readActiveMatch() {
      setActiveMatchId(localStorage.getItem(ACTIVE_MATCH_STORAGE_KEY) ?? "");
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === ACTIVE_MATCH_STORAGE_KEY) readActiveMatch();
    }

    function handleActiveChange(event: Event) {
      const detail = (event as CustomEvent<{ matchId?: string }>).detail;
      setActiveMatchId(detail?.matchId ?? localStorage.getItem(ACTIVE_MATCH_STORAGE_KEY) ?? "");
    }

    readActiveMatch();
    window.addEventListener(ACTIVE_MATCH_EVENT, handleActiveChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(ACTIVE_MATCH_EVENT, handleActiveChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === activeMatchId) ?? null,
    [activeMatchId, matches],
  );
  const matchLabel = selectedMatch
    ? `${getTeamName(selectedMatch.home)} 对 ${getTeamName(selectedMatch.away)}`
    : "not found";

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const stored = readStoredKnowledge();
    const scopedItems = selectedMatch
      ? (stored.items ?? []).filter((item) => !item.matchId || item.matchId === selectedMatch.id)
      : [];
    const history = messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const userMessage: PetMessage = { id: createId(), role: "user", content: text };

    setMessages((current) => [...current, userMessage]);
    setInput("");

    if (pendingDelete && isConfirmDelete(text)) {
      const notice = applyConfirmedDelete(pendingDelete, selectedMatch);
      setPendingDelete(null);
      setMessages((current) => [
        ...current,
        { id: createId(), role: "assistant", content: notice },
      ]);
      return;
    }

    if (pendingDelete && !isConfirmDelete(text)) {
      setPendingDelete(null);
    }

    if (isDeleteKnowledgeIntent(text)) {
      if (!selectedMatch) {
        setMessages((current) => [
          ...current,
          { id: createId(), role: "assistant", content: "not found：先在主页面点一场比赛。" },
        ]);
        return;
      }

      const count = scopedItems.filter((item) => item.matchId === selectedMatch.id).length;
      setPendingDelete({
        kind: "currentMatch",
        matchId: selectedMatch.id,
        matchLabel,
        count,
      });
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content:
            count > 0
              ? `这是删除操作。当前比赛有 ${count} 条情报。确认删除请回复：确认删除知识库`
              : "当前比赛没有可删除的情报。",
        },
      ]);
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(appPath("/api/agent"), {
        method: "POST",
        headers: jsonHeaders(getAuthToken()),
        body: JSON.stringify({
          message: text,
          history,
          selectedMatch,
          knowledgeItems: scopedItems,
        }),
      });
      const data = (await response.json()) as AgentApiResponse;
      if (!response.ok || data.error) throw new Error(data.error ?? "agent 请求失败");

      const deleteIds = data.actions?.deleteItemIds ?? [];
      if (deleteIds.length > 0) {
        setPendingDelete({ kind: "ids", ids: deleteIds, count: deleteIds.length });
      }
      const safeActions = deleteIds.length > 0
        ? { ...data.actions, deleteItemIds: [] }
        : data.actions;
      const actionNotice = await applyActions(safeActions, selectedMatch);
      const deleteNotice =
        deleteIds.length > 0
          ? `检测到删除请求。确认删除 ${deleteIds.length} 条情报，请回复：确认删除知识库`
          : "";
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: [data.reply ?? "已处理。", actionNotice, deleteNotice].filter(Boolean).join("\n"),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: friendlyError(error),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="agent-pet-button fixed bottom-6 right-6 z-[70] flex h-[74px] w-[74px] items-center justify-center rounded-full border border-emerald-300/35 bg-ink-800 shadow-card outline-none transition hover:border-emerald-300 focus:ring-2 focus:ring-emerald-300"
        aria-label="打开全局桌宠"
      >
        <span className="agent-pet-face">
          <span className="agent-pet-eye" />
          <span className="agent-pet-eye" />
        </span>
        <span className="absolute -bottom-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-ink-900">
          AI
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[70] w-[min(420px,calc(100vw-20px))]">
      <div className="agent-pet-panel overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-800/95 shadow-card backdrop-blur-xl">
        <div className="relative px-5 pb-4 pt-4">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="agent-pet-avatar shrink-0" />
              <div className="min-w-0 pt-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold leading-6 text-white">小赛</h2>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-white/62">当前：{matchLabel}</p>
                <p className="mt-1 text-xs text-white/36">问项目、整理情报、写入知识库</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-white/[0.06] px-3.5 py-2 text-sm font-bold text-white/68 transition hover:bg-white/[0.1] hover:text-white"
            >
              收起
            </button>
          </div>
        </div>

        <div
          ref={listRef}
          className="agent-pet-chat flex max-h-[430px] min-h-[330px] flex-col gap-3 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 && (
            <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-4 text-sm leading-6 text-white/68">
              <p className="font-semibold text-white/82">可以直接说事。</p>
              <p className="mt-1">粘贴情报后说“入库”，我会按当前比赛整理。</p>
              {!selectedMatch && <p className="mt-2 text-amber-200/75">当前是 not found，先在主页面点一场比赛。</p>}
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`w-fit max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-[0_12px_26px_-22px_rgba(0,0,0,0.9)] ${
                  message.role === "user"
                    ? "rounded-br-md bg-emerald-400 text-ink-900"
                    : "rounded-bl-md bg-white/[0.07] text-white/78"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          ))}

          {busy && (
            <div className="mr-auto inline-flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-white/[0.07] px-4 py-2.5 text-sm text-white/58">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
              处理中
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="p-4 pt-2">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.045] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              rows={3}
              placeholder="问问题，或粘贴情报说入库"
              className="min-h-[82px] w-full resize-none rounded-xl border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-white outline-none placeholder:text-white/32"
            />
            <div className="flex items-center justify-end border-t border-white/[0.06] px-2 pt-2">
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="min-w-[88px] rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-extrabold text-ink-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
              >
                发送
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

async function applyActions(actions: AgentActions | undefined, selectedMatch: Match | null) {
  const addItems = actions?.addItems ?? [];
  const updateItems = actions?.updateItems ?? [];
  const deleteItemIds = actions?.deleteItemIds ?? [];
  const hasChanges = addItems.length > 0 || updateItems.length > 0 || deleteItemIds.length > 0;
  if (!hasChanges) return "";

  if (!selectedMatch) return "not found：没有选中比赛，未写入知识库。";

  const stored = readStoredKnowledge();
  const deleted = new Set(deleteItemIds);
  const updates = new Map(updateItems.map((item) => [item.id, item]));
  const now = new Date().toISOString();
  let items = (stored.items ?? [])
    .filter((item) => !deleted.has(item.id))
    .map((item) => {
      const update = updates.get(item.id);
      if (!update) return item;
      const patch: Partial<KnowledgeItem> = {};
      if (update.title) patch.title = update.title;
      if (update.category) patch.category = normalizeCategory(update.category);
      if (update.content) patch.content = update.content;
      if (update.sourceLabel) patch.sourceLabel = update.sourceLabel;
      if (update.sourceUrl) patch.sourceUrl = update.sourceUrl;
      if (update.reliability) patch.reliability = normalizeReliability(update.reliability);
      return {
        ...item,
        ...patch,
        updatedAt: now,
      };
    });

  items = mergeKnowledgeItems([
    ...items,
    ...addItems.map((item) => ({
      ...item,
      id: item.id || createId(),
      matchId: selectedMatch.id,
      scope: item.scope || `${getTeamName(selectedMatch.home)} 对 ${getTeamName(selectedMatch.away)}`,
      category: normalizeCategory(item.category),
      reliability: normalizeReliability(item.reliability),
      createdAt: item.createdAt || now,
      updatedAt: now,
    })),
  ]);

  let compiled = stored.compiled ?? null;
  let compiledScopeKey = stored.compiledScopeKey ?? null;

  if (actions?.compile !== false) {
    const scopedItems = items.filter((item) => !item.matchId || item.matchId === selectedMatch.id);
    try {
      const response = await fetch(appPath("/api/knowledge/compile"), {
        method: "POST",
        headers: jsonHeaders(getAuthToken()),
        body: JSON.stringify({ items: scopedItems }),
      });
      const data = (await response.json()) as { compiled?: CompiledKnowledge };
      if (response.ok && data.compiled) {
        compiled = data.compiled;
        compiledScopeKey = selectedMatch.id;
      } else {
        compiled = null;
        compiledScopeKey = null;
      }
    } catch {
      compiled = null;
      compiledScopeKey = null;
    }
  } else {
    compiled = null;
    compiledScopeKey = null;
  }

  localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      items,
      compiled,
      compiledScopeKey,
    }),
  );
  window.dispatchEvent(new CustomEvent(KNOWLEDGE_UPDATED_EVENT));

  const parts = [];
  if (addItems.length > 0) parts.push(`入库 ${addItems.length} 条`);
  if (updateItems.length > 0) parts.push(`修改 ${updateItems.length} 条`);
  if (deleteItemIds.length > 0) parts.push(`删除 ${deleteItemIds.length} 条`);
  return `已${parts.join("，")}。`;
}

function readStoredKnowledge(): StoredKnowledge {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
    if (!raw) return { items: [], compiled: null, compiledScopeKey: null };
    const parsed = JSON.parse(raw) as StoredKnowledge;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      compiled: parsed.compiled ?? null,
      compiledScopeKey: parsed.compiledScopeKey ?? null,
    };
  } catch {
    return { items: [], compiled: null, compiledScopeKey: null };
  }
}

function mergeKnowledgeItems(items: KnowledgeItem[]) {
  const byKey = new Map<string, KnowledgeItem>();
  for (const item of items) {
    const key = item.sourceUrl
      ? `url:${item.sourceUrl}`
      : `text:${item.title.toLowerCase()}|${item.content.slice(0, 96).toLowerCase()}`;
    byKey.set(key, item);
  }
  return Array.from(byKey.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function normalizeCategory(value: unknown): KnowledgeCategory {
  return CATEGORY_SET.has(value as KnowledgeCategory) ? (value as KnowledgeCategory) : "other";
}

function normalizeReliability(value: unknown): KnowledgeReliability {
  return value === "high" || value === "low" ? value : "mid";
}

function isDeleteKnowledgeIntent(text: string) {
  return /(?:删除|清空|删掉|删了).*(?:知识库|情报)|(?:知识库|情报).*(?:删除|清空|删掉|删了)/.test(text);
}

function isConfirmDelete(text: string) {
  return /^(确认删除知识库|确认删除|确定删除|确认清空)$/i.test(text.trim());
}

function applyConfirmedDelete(pending: PendingDelete, selectedMatch: Match | null) {
  const stored = readStoredKnowledge();
  const currentItems = stored.items ?? [];
  let nextItems = currentItems;

  if (pending.kind === "currentMatch") {
    nextItems = currentItems.filter((item) => item.matchId !== pending.matchId);
  } else {
    const ids = new Set(pending.ids);
    nextItems = currentItems.filter((item) => !ids.has(item.id));
  }

  const removed = currentItems.length - nextItems.length;
  const selectedMatchId = selectedMatch?.id ?? null;
  const shouldClearCompiled =
    !selectedMatchId ||
    stored.compiledScopeKey === selectedMatchId ||
    (pending.kind === "currentMatch" && stored.compiledScopeKey === pending.matchId);

  localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      items: nextItems,
      compiled: shouldClearCompiled ? null : stored.compiled ?? null,
      compiledScopeKey: shouldClearCompiled ? null : stored.compiledScopeKey ?? null,
    }),
  );
  window.dispatchEvent(new CustomEvent(KNOWLEDGE_UPDATED_EVENT));

  if (removed <= 0) return "没有可删除的情报。";
  return `已删除 ${removed} 条情报。`;
}

function friendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/network|fetch|timeout/i.test(raw)) return "agent 暂时连不上后端。";
  return raw || "agent 处理失败。";
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAuthToken(): string | undefined {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as Partial<AuthUser>) : null;
    return session?.token || undefined;
  } catch {
    return undefined;
  }
}

function jsonHeaders(authToken?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}
