"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CompiledKnowledge,
  KnowledgeCategory,
  KnowledgeItem,
  KnowledgeReliability,
  Match,
  PredictionStrategyConfig,
} from "@/lib/types";
import { getTeamName, getTeamNameEn } from "@/lib/data";
import { normalizeStrategyConfig } from "@/lib/strategies";
import { KNOWLEDGE_STORAGE_KEY, KNOWLEDGE_UPDATED_EVENT } from "@/lib/client-state";
import { appPath } from "@/lib/base-path";
import { ChevronToggle } from "@/components/ChevronToggle";

const EMPTY_FORM = {
  title: "",
  category: "other" as KnowledgeCategory,
  content: "",
  scope: "全局",
  sourceLabel: "",
  sourceUrl: "",
  reliability: "mid" as KnowledgeReliability,
};

interface StoredKnowledge {
  items?: KnowledgeItem[];
  compiled?: CompiledKnowledge | null;
  compiledScopeKey?: string | null;
}

interface ApiResponse {
  items?: KnowledgeItem[];
  incomingItems?: KnowledgeItem[];
  compiled?: CompiledKnowledge;
  notice?: string;
  warning?: string;
  error?: string;
}

interface AgentImportResponse {
  reply?: string;
  actions?: {
    addItems?: KnowledgeItem[];
    updateItems?: {
      id: string;
      title?: string;
      category?: KnowledgeCategory;
      content?: string;
      sourceLabel?: string;
      sourceUrl?: string;
      reliability?: KnowledgeReliability;
    }[];
    compile?: boolean;
  };
  error?: string;
}

export function KnowledgePanel({
  selectedMatch,
  onCompiledChange,
  embedded = false,
  storageKey,
  authToken,
}: {
  selectedMatch: Match | null;
  onCompiledChange: (payload: {
    prompt: string;
    scopeKey: string | null;
    strategyConfig: PredictionStrategyConfig;
  }) => void;
  embedded?: boolean;
  storageKey?: string;
  authToken?: string;
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [compiled, setCompiled] = useState<CompiledKnowledge | null>(null);
  const [compiledScopeKey, setCompiledScopeKey] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"search" | "compile" | "import" | null>(null);
  const [status, setStatus] = useState("未整理");
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const selectedMatchId = selectedMatch?.id ?? "";
  const selectedScopeKey = selectedMatch?.id ?? null;
  const knowledgeStorageKey = storageKey ?? KNOWLEDGE_STORAGE_KEY;

  useEffect(() => {
    async function loadStoredKnowledge() {
      try {
        const stored = authToken
          ? await fetchServerKnowledge(authToken)
          : readLocalKnowledge(knowledgeStorageKey);
        if (!stored) {
          setItems([]);
          setCompiled(null);
          setCompiledScopeKey(null);
          setStatus("未整理");
          setHydrated(true);
          return;
        }

        setItems(Array.isArray(stored.items) ? stored.items : []);
        setCompiled(stored.compiledScopeKey ? stored.compiled ?? null : null);
        setCompiledScopeKey(stored.compiledScopeKey ?? null);
        setStatus(stored.compiledScopeKey ? "已加载" : "未整理");
      } catch {
        setStatus("读取失败");
        setHydrated(false);
        return;
      }

      setHydrated(true);
    }

    function handleStorage(event: StorageEvent) {
      if (!authToken && event.key === knowledgeStorageKey) void loadStoredKnowledge();
    }

    setHydrated(false);
    loadStoredKnowledge();
    window.addEventListener(KNOWLEDGE_UPDATED_EVENT, loadStoredKnowledge);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(KNOWLEDGE_UPDATED_EVENT, loadStoredKnowledge);
      window.removeEventListener("storage", handleStorage);
    };
  }, [authToken, knowledgeStorageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const state = { items, compiled, compiledScopeKey };
    if (authToken) {
      void saveServerKnowledge(authToken, state);
    } else {
      localStorage.setItem(knowledgeStorageKey, JSON.stringify(state));
    }
  }, [authToken, compiled, compiledScopeKey, hydrated, items, knowledgeStorageKey]);

  useEffect(() => {
    setNotice(null);
    setImportNotice(null);
  }, [selectedMatchId]);

  const filteredItems = useMemo(() => {
    if (!selectedMatchId) return [];
    return items.filter((item) => !item.matchId || item.matchId === selectedMatchId);
  }, [items, selectedMatchId]);

  const currentCompiled =
    selectedScopeKey && compiled && compiledScopeKey === selectedScopeKey ? compiled : null;
  const strategyConfig = useMemo(
    () => normalizeStrategyConfig(),
    [],
  );

  useEffect(() => {
    onCompiledChange(
      currentCompiled && selectedScopeKey
        ? { prompt: currentCompiled.prompt, scopeKey: selectedScopeKey, strategyConfig }
        : { prompt: "", scopeKey: null, strategyConfig },
    );
  }, [currentCompiled, onCompiledChange, selectedScopeKey, strategyConfig]);

  const defaultSearchQuery = useMemo(() => {
    if (!selectedMatch) return "";
    const homeName = getTeamName(selectedMatch.home);
    const awayName = getTeamName(selectedMatch.away);
    const homeNameEn = getTeamNameEn(selectedMatch.home);
    const awayNameEn = getTeamNameEn(selectedMatch.away);
    return [
      "World Cup 2026",
      `${homeName} ${homeNameEn}`,
      "vs",
      `${awayName} ${awayNameEn}`,
      selectedMatch.date,
      "latest odds ranking injury lineup team news weather head to head form",
    ].join(" ");
  }, [selectedMatch]);

  function updateForm<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function editItem(item: KnowledgeItem) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: item.category,
      content: item.content,
      scope: item.scope,
      sourceLabel: item.sourceLabel ?? "",
      sourceUrl: item.sourceUrl ?? "",
      reliability: item.reliability,
    });
  }

  function closeEditor() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveEditedItem(compileAfter = false) {
    const currentItem = items.find((item) => item.id === editingId);
    if (!currentItem) {
      closeEditor();
      return;
    }

    if (!form.content.trim()) {
      setStatus("先写内容");
      setNotice("先写内容，再保存。");
      return;
    }

    const now = new Date().toISOString();
    const sourceUrl = normalizeUrl(form.sourceUrl) ?? extractFirstUrl(form.content);
    const inferredCategory = inferCategory(form.content);
    const nextItem: KnowledgeItem = {
      ...currentItem,
      title: form.title.trim() || buildAutoTitle(form.content, inferredCategory),
      category: inferredCategory,
      content: form.content.trim(),
      scope: form.scope.trim() || currentItem.scope,
      sourceLabel: form.sourceLabel.trim() || (sourceUrl ? sourceLabelFromUrl(sourceUrl) : undefined),
      sourceUrl,
      reliability: form.reliability,
      updatedAt: now,
    };

    const nextItems = items.map((item) => (item.id === currentItem.id ? nextItem : item));

    setItems(nextItems);
    setCompiled(null);
    setCompiledScopeKey(null);
    closeEditor();
    setNotice(null);
    setStatus(compileAfter ? "已修改，整理中" : "已修改，建议整理");

    if (compileAfter) {
      if (!selectedScopeKey) {
        setStatus("not found");
        setNotice("not found");
        return;
      }
      const scopedItems = nextItems.filter((item) => !item.matchId || item.matchId === selectedMatchId);
      await compileKnowledge(scopedItems, selectedScopeKey);
    }
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setCompiled(null);
    setCompiledScopeKey(null);
    if (editingId === id) closeEditor();
    setStatus("已删除，建议整理");
  }

  async function compileKnowledge(nextItems = filteredItems, scopeKey = selectedScopeKey) {
    if (!scopeKey) {
      setCompiled(null);
      setCompiledScopeKey(null);
      setStatus("not found");
      setNotice("not found");
      return;
    }

    if (nextItems.length === 0) {
      setCompiled(null);
      setCompiledScopeKey(null);
      setStatus("暂无信息");
      return;
    }

    setBusy("compile");
    setNotice(null);
    setStatus("整理中");
    try {
      const response = await fetch(appPath("/api/knowledge/compile"), {
        method: "POST",
        headers: jsonHeaders(authToken),
        body: JSON.stringify({ items: nextItems }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || data.error) throw new Error(data.error ?? "整理失败");
      setItems((current) => mergeKnowledgeCollections(current, data.items ?? nextItems));
      setCompiled(data.compiled ?? null);
      setCompiledScopeKey(scopeKey);
      setStatus(data.warning ? "已基础整理" : "已整理");
    } catch (error) {
      setStatus(friendlyError(error, "知识库整理失败"));
    } finally {
      setBusy(null);
    }
  }

  async function searchAndCompile() {
    if (!selectedMatch || !selectedScopeKey) {
      setCompiled(null);
      setCompiledScopeKey(null);
      setNotice("not found");
      setStatus("not found");
      return;
    }

    const searchQuery = defaultSearchQuery;
    const scopeKey = selectedScopeKey;
    const scopeItems = filteredItems;
    setBusy("search");
    setNotice(null);
    setStatus("联网查找中");
    try {
      const response = await fetch(appPath("/api/knowledge/search"), {
        method: "POST",
        headers: jsonHeaders(authToken),
        body: JSON.stringify({
          query: searchQuery,
          matchId: selectedMatchId || undefined,
          existingItems: scopeItems,
        }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || data.error) throw new Error(data.error ?? "联网查找失败");
      setItems((current) => mergeKnowledgeCollections(current, data.items ?? scopeItems));
      setCompiled(data.compiled ?? null);
      setCompiledScopeKey(scopeKey);
      const incomingCount = data.incomingItems?.length ?? 0;
      if (incomingCount === 0) {
        const message = data.notice ?? "没搜到可保存的信息，换关键词试试。";
        setNotice(message);
        setStatus(message);
      } else if (data.warning) {
        setNotice(data.notice ?? null);
        setStatus(`已入库 ${incomingCount} 条，已整理`);
      } else {
        setNotice(data.notice ?? null);
        setStatus(data.notice ?? `已入库 ${incomingCount} 条`);
      }
    } catch (error) {
      const message = friendlyError(error, "联网查找失败");
      setNotice(message);
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  async function importKnowledge() {
    const text = importText.trim();
    if (!selectedMatch || !selectedScopeKey) {
      setImportNotice("not found");
      setStatus("not found");
      return;
    }

    if (!text) {
      setImportNotice("先粘贴情报。");
      return;
    }

    setBusy("import");
    setImportNotice(null);
    setNotice(null);
    setStatus("导入中");

    try {
      const response = await fetch(appPath("/api/agent"), {
        method: "POST",
        headers: jsonHeaders(authToken),
        body: JSON.stringify({
          message: [
            "请把下面内容导入当前比赛知识库。",
            "只提取能用于赛前预测的事实；多个事实请拆成多条；保留链接；不确定就标低可信；不要编造。",
            "内容：",
            text,
          ].join("\n"),
          selectedMatch,
          knowledgeItems: filteredItems,
        }),
      });
      const data = (await response.json()) as AgentImportResponse;
      if (!response.ok || data.error) throw new Error(data.error ?? "导入失败");

      const nextItems = applyAgentImportActions(items, data.actions);
      const changed = nextItems.length !== items.length || Boolean(data.actions?.updateItems?.length);
      if (!changed) {
        const message = data.reply ?? "没有识别到可入库的情报。";
        setImportNotice(message);
        setStatus(message);
        return;
      }

      setItems(nextItems);
      setCompiled(null);
      setCompiledScopeKey(null);
      setImportText("");
      setImportOpen(false);
      setStatus("已导入，整理中");

      const scopedItems = nextItems.filter((item) => !item.matchId || item.matchId === selectedMatchId);
      if (data.actions?.compile === false) {
        setStatus("已导入，建议整理");
      } else {
        await compileKnowledge(scopedItems, selectedScopeKey);
      }
    } catch (error) {
      const message = friendlyError(error, "导入失败");
      setImportNotice(message);
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  const hasSavedItems = filteredItems.length > 0;
  const accountItemCount = items.length;
  const compiledReady = Boolean(currentCompiled && currentCompiled.sourceCount > 0);
  const showOutput = compiledReady || hasSavedItems;
  const scopeLabel = selectedMatch
    ? `${getTeamName(selectedMatch.home)} 对 ${getTeamName(selectedMatch.away)}`
    : "not found";
  const knowledgeSummary = selectedMatch
    ? hasSavedItems
      ? accountItemCount > filteredItems.length
        ? `本场 ${filteredItems.length} 条 · 账号共 ${accountItemCount} 条`
        : `${filteredItems.length} 条情报`
      : accountItemCount > 0
        ? `本场 0 条 · 账号共 ${accountItemCount} 条`
        : "赛前情报"
    : "not found";

  return (
    <section
      id="knowledge"
      className={embedded ? "" : "mx-auto mt-10 max-w-6xl"}
    >
      <div className="glass h-full min-h-[126px] rounded-lg p-6 shadow-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPanelOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setPanelOpen((current) => !current);
            }
          }}
          className="grid min-h-[78px] cursor-pointer grid-cols-[1fr_auto] items-center gap-6 rounded-md outline-none transition hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <div>
            <div className="flex items-center gap-3.5">
              <h2 className="text-2xl font-extrabold tracking-normal text-white">知识库</h2>
            </div>
            <p className="mt-2 text-sm font-semibold text-white/70">
              {knowledgeSummary}
            </p>
          </div>
          <div className="flex justify-end">
            <ChevronToggle
              open={panelOpen}
              onClick={() => setPanelOpen((current) => !current)}
              label={panelOpen ? "收起知识库" : "展开知识库"}
            />
          </div>
        </div>

        {panelOpen && (
          <>
            <div className="mt-5">
              {selectedMatch ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/36">当前比赛</p>
                    <p className="mt-1 truncate text-base font-extrabold text-white/86">{scopeLabel}</p>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setImportOpen(true)}
                      disabled={busy !== null}
                      className="min-w-[104px] rounded-md border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white/78 transition hover:border-white/18 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      导入
                    </button>
                    <button
                      type="button"
                      onClick={searchAndCompile}
                      disabled={busy !== null}
                      className="min-w-[112px] rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {busy === "search" ? "搜索中…" : "联网搜索"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[44px] items-center pb-2 text-sm font-semibold text-white/45">
                  not found
                </div>
              )}

              {notice && (
                <div className="mt-3 rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                  {compactText(notice, 90)}
                </div>
              )}
            </div>

            {compiledReady && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-sm text-emerald-200">
                <span className="font-bold">✓ 已整理</span>
                <span className="text-emerald-100/80">
                  「{scopeLabel}」{currentCompiled?.sourceCount} 条
                </span>
              </div>
            )}

            {showOutput ? (
              <div className="mt-3 grid gap-3">
                {currentCompiled && currentCompiled.sourceCount > 0 && (
                  <div className="rounded-lg bg-white/[0.025] p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-white">整理结果</h3>
                      <span className="text-[11px] text-white/38">
                        {currentCompiled.sourceCount} 条
                      </span>
                    </div>
                    <div>
                      <p className="text-sm leading-6 text-white/70">{currentCompiled.summary}</p>
                      {(currentCompiled.facts.length > 0 || currentCompiled.risks.length > 0) && (
                        <details className="mt-2 rounded-md border border-white/8 bg-white/[0.025] px-3 py-2">
                          <summary className="cursor-pointer text-xs font-semibold text-white/55">
                            查看要点
                          </summary>
                          {currentCompiled.facts.length > 0 && (
                            <ul className="mt-3 grid gap-2">
                              {currentCompiled.facts.slice(0, 4).map((fact) => (
                                <li key={fact} className="text-xs leading-5 text-white/60">
                                  {fact}
                                </li>
                              ))}
                            </ul>
                          )}
                          {currentCompiled.risks.length > 0 && (
                            <ul className="mt-3 grid gap-2 border-t border-white/8 pt-3">
                              {currentCompiled.risks.slice(0, 3).map((risk) => (
                                <li key={risk} className="text-xs leading-5 text-amber-100/78">
                                  {risk}
                                </li>
                              ))}
                            </ul>
                          )}
                        </details>
                      )}
                    </div>
                  </div>
                )}

                {hasSavedItems && (
                  <div className="rounded-lg bg-white/[0.025] p-3">
                    <div className="mb-2 flex items-center justify-end">
                      <span className="text-[11px] text-white/38">{filteredItems.length} 条</span>
                    </div>
                    <div className="grid min-h-[520px] max-h-[640px] gap-2 overflow-y-auto overflow-x-hidden pr-1">
                      {filteredItems.map((item) => (
                        <article
                          key={item.id}
                          className="rounded-md bg-white/[0.035] p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="mt-2 truncate text-sm font-semibold text-white/90">
                                {item.title}
                              </h4>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => editItem(item)}
                                className="text-xs font-semibold text-sky-300/85 transition hover:text-sky-200"
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                className="text-xs font-semibold text-rose-300/85 transition hover:text-rose-200"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                          <p className="mt-2 break-words text-xs leading-5 text-white/58">
                            {compactText(item.content)}
                          </p>
                          {(item.sourceLabel || item.sourceUrl) && (
                            <p className="mt-2 truncate text-[11px] text-white/35">
                              {item.sourceUrl ? (
                                <a
                                  className="transition hover:text-white/70"
                                  href={item.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.sourceLabel ?? item.sourceUrl}
                                </a>
                              ) : (
                                item.sourceLabel
                              )}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.025] px-6 py-10 text-center">
                <p className="text-sm font-medium text-white/65">
                  {selectedMatch ? "这场还没有情报" : "not found"}
                </p>
              </div>
            )}

            {editingId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
                <div className="w-full max-w-xl rounded-lg border border-white/10 bg-ink-800 p-4 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-bold text-white">修改情报</h3>
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/62 transition hover:text-white"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <input
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      placeholder="标题"
                      className="min-w-0 rounded-md border border-white/10 bg-ink-700 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400"
                    />
                    <textarea
                      value={form.content}
                      onChange={(event) => updateForm("content", event.target.value)}
                      placeholder="情报内容"
                      rows={5}
                      className="w-full resize-none rounded-md border border-white/10 bg-ink-700 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-emerald-400"
                    />
                    <input
                      value={form.sourceUrl}
                      onChange={(event) => updateForm("sourceUrl", event.target.value)}
                      placeholder="来源链接（可选）"
                      className="min-w-0 rounded-md border border-white/10 bg-ink-700 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400"
                    />
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="rounded-md border border-white/12 px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEditedItem(true)}
                      disabled={busy !== null}
                      className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-ink-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {busy === "compile" ? "整理中" : "保存"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {importOpen && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
                <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-ink-800 p-5 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-extrabold text-white">导入情报</h3>
                      <p className="mt-1 truncate text-sm text-white/48">{scopeLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportOpen(false);
                        setImportNotice(null);
                      }}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-sm font-semibold text-white/62 transition hover:text-white"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="mt-4">
                    <textarea
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder="粘贴赛前消息、赔率、伤停、首发、天气、战绩、链接..."
                      rows={9}
                      className="w-full resize-none rounded-lg border border-white/10 bg-ink-700 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/28 focus:border-emerald-400"
                    />
                  </div>

                  {importNotice && (
                    <div className="mt-3 rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                      {compactText(importNotice, 120)}
                    </div>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImportOpen(false);
                        setImportNotice(null);
                      }}
                      className="rounded-md border border-white/12 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:text-white"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={importKnowledge}
                      disabled={busy !== null || !importText.trim()}
                      className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {busy === "import" ? "导入中" : "导入并整理"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function normalizeUrl(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function extractFirstUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s，。；、)）]+/i);
  return match ? normalizeUrl(match[0]) : undefined;
}

function sourceLabelFromUrl(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function inferCategory(content: string): KnowledgeCategory {
  if (/赔率|盘口|欧指|亚指|主胜|客胜|让球|水位|竞彩/.test(content)) return "market";
  if (/伤停|受伤|缺阵|伤缺|无法出战|停赛|injur|suspend|out\b/i.test(content)) {
    return "injury";
  }
  if (/首发|阵容|名单|替补|lineup|squad|starting/i.test(content)) return "lineup";
  if (/天气|温度|降雨|风速|weather/i.test(content)) return "weather";
  if (/交锋|历史|往绩|h2h|head[- ]to[- ]head/i.test(content)) return "history";
  if (/近期|近\d+场|战绩|状态|连胜|不胜|进球|失球|form/i.test(content)) return "form";
  if (/战术|阵型|打法|压迫|反击|tactic/i.test(content)) return "tactics";
  if (/旅程|飞行|时差|travel|jet lag/i.test(content)) return "travel";
  if (/新闻|消息|公告|官方|news|report/i.test(content)) return "team_news";
  return "other";
}

function buildAutoTitle(content: string, category: KnowledgeCategory): string {
  const label: Record<KnowledgeCategory, string> = {
    team_news: "球队消息",
    injury: "伤停",
    lineup: "阵容",
    tactics: "战术",
    weather: "天气",
    travel: "旅程",
    form: "状态",
    history: "交锋",
    market: "盘口",
    other: "情报",
  };
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return `${label[category]}：${compactText(firstLine ?? content, 24)}`;
}

function compactText(value: string, limit = 92): string {
  const text = value.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function jsonHeaders(authToken?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

function readLocalKnowledge(storageKey: string): StoredKnowledge | null {
  const raw = localStorage.getItem(storageKey);
  return raw ? (JSON.parse(raw) as StoredKnowledge) : null;
}

async function fetchServerKnowledge(token: string): Promise<StoredKnowledge | null> {
  const response = await fetch(appPath("/api/user/knowledge"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new Error("登录已失效");
  if (response.status === 503) throw new Error("数据库暂时不可用");
  if (!response.ok) throw new Error("读取知识库失败");
  return (await response.json()) as StoredKnowledge;
}

async function saveServerKnowledge(token: string, state: StoredKnowledge) {
  await fetch(appPath("/api/user/knowledge"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(state),
  }).catch(() => undefined);
}

function mergeKnowledgeCollections(
  existing: KnowledgeItem[],
  incoming: KnowledgeItem[],
): KnowledgeItem[] {
  const byKey = new Map<string, KnowledgeItem>();

  for (const item of existing) {
    byKey.set(knowledgeItemKey(item), item);
  }
  for (const item of incoming) {
    byKey.set(knowledgeItemKey(item), item);
  }

  return Array.from(byKey.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function applyAgentImportActions(
  existing: KnowledgeItem[],
  actions: AgentImportResponse["actions"] | undefined,
): KnowledgeItem[] {
  const updates = new Map((actions?.updateItems ?? []).map((item) => [item.id, item]));
  const now = new Date().toISOString();

  const patched = existing.map((item) => {
    const update = updates.get(item.id);
    if (!update) return item;

    const content = update.content?.trim();
    const sourceUrl =
      update.sourceUrl !== undefined
        ? normalizeUrl(update.sourceUrl)
        : content
          ? extractFirstUrl(content) ?? item.sourceUrl
          : item.sourceUrl;

    return {
      ...item,
      title: update.title?.trim() || item.title,
      category: update.category ?? item.category,
      content: content || item.content,
      sourceLabel: update.sourceLabel?.trim() || item.sourceLabel,
      sourceUrl,
      reliability: update.reliability ?? item.reliability,
      updatedAt: now,
    };
  });

  const imported = (actions?.addItems ?? [])
    .filter((item) => item.content?.trim())
    .map((item) => ({
      ...item,
      id: item.id || createClientKnowledgeId(),
      title: item.title?.trim() || buildAutoTitle(item.content, item.category),
      content: item.content.trim(),
      sourceUrl: item.sourceUrl ?? extractFirstUrl(item.content),
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
    }));

  return mergeKnowledgeCollections(patched, imported);
}

function knowledgeItemKey(item: KnowledgeItem): string {
  if (item.sourceUrl) return `url:${item.sourceUrl}`;
  return `id:${item.id}`;
}

function createClientKnowledgeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `knowledge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function friendlyError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw) return fallback;

  if (/API_KEY|not configured|QWEN_SEARCH_ENABLED|DASHSCOPE/i.test(raw)) {
    return "联网查找还没有配置好，请先检查后台开关和密钥。";
  }
  if (/search failed|fetch failed|network|ENOTFOUND|ECONN|timeout/i.test(raw)) {
    return "联网查找失败，请稍后再试，或先手动补充信息。";
  }
  if (/compile failed|knowledge compile failed|整理失败/i.test(raw)) {
    return "知识库整理失败，请稍后重试。";
  }
  if (/invalid JSON body/i.test(raw)) {
    return "提交内容格式不正确，请刷新页面后再试。";
  }

  return raw;
}
