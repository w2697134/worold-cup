"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompiledKnowledge, KnowledgeItem, Match, Prediction, PredictionStrategyConfig } from "@/lib/types";
import { getTeamName, getTeamNameEn, isMatchupKnown } from "@/lib/data";
import { formatChinaKickoff, getChinaDateKey, toUtcFromVenueTime } from "@/lib/time";
import { appPath } from "@/lib/base-path";
import { MatchCard } from "@/components/MatchCard";
import { PredictionDrawer } from "@/components/PredictionDrawer";
import { KnowledgePanel } from "@/components/KnowledgePanel";
import { LoginScreen } from "@/components/LoginScreen";
import { ReviewPanel } from "@/components/ReviewPanel";
import { StrategyPanel } from "@/components/StrategyPanel";
import {
  ACTIVE_MATCH_EVENT,
  ACTIVE_MATCH_STORAGE_KEY,
  AUTH_SESSION_STORAGE_KEY,
  PREDICTION_CACHE_STORAGE_KEY,
  KNOWLEDGE_STORAGE_KEY,
  KNOWLEDGE_UPDATED_EVENT,
  scopedStorageKey,
} from "@/lib/client-state";
import type { AuthUser } from "@/lib/client-state";

type ScheduleState = "loading" | "live" | "snapshot" | "error";
type StoredKnowledge = {
  items?: KnowledgeItem[];
  compiled?: CompiledKnowledge | null;
  compiledScopeKey?: string | null;
};

type KnowledgeApiResponse = {
  items?: KnowledgeItem[];
  incomingItems?: KnowledgeItem[];
  compiled?: CompiledKnowledge;
  notice?: string;
  warning?: string;
  error?: string;
};

const TODAY = getChinaTodayKey();

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function weekday(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function shortStage(stage: string) {
  return stage.replace("小组赛 · ", "");
}

export default function Home() {
  const [authLoaded, setAuthLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeDate, setActiveDate] = useState(TODAY);
  const [selected, setSelected] = useState<Match | null>(null);
  const [predictionRequest, setPredictionRequest] = useState({
    forceRefresh: false,
    requestId: 0,
  });
  const [predictionCache, setPredictionCache] = useState<Record<string, Prediction>>({});
  const [predictionCacheHydrated, setPredictionCacheHydrated] = useState(false);
  const [storedActiveMatchId, setStoredActiveMatchId] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduleState, setScheduleState] = useState<ScheduleState>("loading");
  const [knowledge, setKnowledge] = useState<{ prompt: string; scopeKey: string | null }>({
    prompt: "",
    scopeKey: null,
  });
  const [strategyConfig, setStrategyConfig] = useState<PredictionStrategyConfig | undefined>();

  const activeMatchStorageKey = useMemo(
    () => (currentUser ? scopedStorageKey(ACTIVE_MATCH_STORAGE_KEY, currentUser.id) : ""),
    [currentUser],
  );
  const predictionCacheStorageKey = useMemo(
    () => (currentUser ? scopedStorageKey(PREDICTION_CACHE_STORAGE_KEY, currentUser.id) : ""),
    [currentUser],
  );
  const knowledgeStorageKey = useMemo(
    () => (currentUser ? scopedStorageKey(KNOWLEDGE_STORAGE_KEY, currentUser.id) : ""),
    [currentUser],
  );

  // 只有当知识库整理的「场次」与当前要预测的这场一致时，
  // 才把情报注入预测——避免把 A 场的情报喂给 B 场。
  const knowledgeForSelected =
    selected && knowledge.scopeKey === selected.id
      ? knowledge.prompt
      : "";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      const session = raw ? (JSON.parse(raw) as Partial<AuthUser>) : null;
      if (session?.id && session.name && session.token) {
        setCurrentUser({ id: session.id, name: session.name, token: session.token });
      } else {
        localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthLoaded(true);
    }
  }, []);

  useEffect(() => {
    setMatches([]);
    setSelected(null);
    setActiveMatch(null);
    setStoredActiveMatchId(null);
    setPredictionCache({});
    setPredictionCacheHydrated(false);
    setKnowledge({ prompt: "", scopeKey: null });
    setStrategyConfig(undefined);
    setScheduleState("loading");
    setLoading(Boolean(currentUser?.token));
  }, [currentUser?.id, currentUser?.token]);

  const handleCompiledChange = useCallback(
    (payload: {
      prompt: string;
      scopeKey: string | null;
      strategyConfig: PredictionStrategyConfig;
    }) => {
      setKnowledge({ prompt: payload.prompt, scopeKey: payload.scopeKey });
      setStrategyConfig(payload.strategyConfig);
    },
    [],
  );

  const rememberActiveMatch = useCallback((match: Match) => {
    if (!activeMatchStorageKey) return;
    setActiveMatch(match);
    localStorage.setItem(activeMatchStorageKey, match.id);
    window.dispatchEvent(new CustomEvent(ACTIVE_MATCH_EVENT, { detail: { matchId: match.id } }));
  }, [activeMatchStorageKey]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    setCurrentUser(null);
  }, []);

  const handleSelectMatch = useCallback((match: Match) => {
    rememberActiveMatch(match);
  }, [rememberActiveMatch]);

  const openPrediction = useCallback(
    (match: Match, forceRefresh: boolean) => {
      rememberActiveMatch(match);
      setPredictionRequest((current) => ({
        forceRefresh,
        requestId: current.requestId + 1,
      }));
      setSelected(match);
    },
    [rememberActiveMatch],
  );

  const handleOpenPrediction = useCallback(
    (match: Match) => openPrediction(match, false),
    [openPrediction],
  );

  const handleRegeneratePrediction = useCallback(
    (match: Match) => openPrediction(match, true),
    [openPrediction],
  );

  const handlePredictionGenerated = useCallback((prediction: Prediction) => {
    setPredictionCache((current) => ({
      ...current,
      [prediction.matchId]: prediction,
    }));
  }, []);

  const ensureKnowledgeForPrediction = useCallback(
    async (match: Match, currentKnowledgeContext: string) => {
      const authToken = currentUser?.token;
      if (!authToken) throw new Error("请先登录。");

      const currentPrompt = currentKnowledgeContext.trim();
      if (knowledge.scopeKey === match.id && currentPrompt) return currentPrompt;

      const stored = await readStoredKnowledgeForPrediction(
        authToken,
      );
      if (
        stored?.compiledScopeKey === match.id &&
        stored.compiled?.prompt?.trim() &&
        (stored.compiled.sourceCount ?? 0) > 0
      ) {
        setKnowledge({ prompt: stored.compiled.prompt, scopeKey: match.id });
        return stored.compiled.prompt;
      }

      const existingItems = Array.isArray(stored?.items) ? stored.items : [];
      const matchItems = existingItems.filter((item) => item.matchId === match.id);
      const scopeItems = existingItems.filter((item) => !item.matchId || item.matchId === match.id);
      const prepared =
        matchItems.length > 0
          ? await compileExistingKnowledge(scopeItems, authToken)
          : await searchKnowledgeForMatch(match, authToken, scopeItems);

      if (!prepared.compiled?.prompt?.trim() || (prepared.compiled.sourceCount ?? 0) === 0) {
        throw new Error("这场还没有可用情报，自动联网也没有找到可入库内容。");
      }

      const nextState: StoredKnowledge = {
        items: mergeKnowledgeCollections(existingItems, prepared.items ?? scopeItems),
        compiled: prepared.compiled,
        compiledScopeKey: match.id,
      };

      await saveStoredKnowledgeForPrediction(
        authToken,
        knowledgeStorageKey,
        nextState,
      );
      setKnowledge({ prompt: prepared.compiled.prompt, scopeKey: match.id });
      window.dispatchEvent(new Event(KNOWLEDGE_UPDATED_EVENT));
      return prepared.compiled.prompt;
    },
    [currentUser?.token, knowledge.scopeKey, knowledgeStorageKey],
  );

  useEffect(() => {
    if (!currentUser?.token) return;
    setLoading(true);
    setScheduleState("loading");
    fetch(appPath("/api/matches"))
      .then((response) => {
        if (!response.ok) throw new Error("赛程加载失败");
        return response.json();
      })
      .then((data: { dates?: string[]; matches?: Match[]; source?: "live" | "snapshot" }) => {
        setMatches(data.matches ?? []);
        setScheduleState(data.source === "snapshot" ? "snapshot" : "live");
      })
      .catch(() => {
        setMatches([]);
        setScheduleState("error");
      })
      .finally(() => setLoading(false));
  }, [currentUser?.token]);

  useEffect(() => {
    if (!currentUser?.token || !predictionCacheStorageKey) return;
    const authToken = currentUser.token;
    let cancelled = false;
    setPredictionCacheHydrated(false);

    async function loadPredictionState() {
      try {
        const response = await fetch(appPath("/api/user/predictions"), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (response.status === 401) {
          localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          if (!cancelled) setCurrentUser(null);
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as {
            activeMatchId?: string | null;
            predictionCache?: Record<string, Prediction>;
          };
          if (!cancelled) {
            setStoredActiveMatchId(data.activeMatchId ?? null);
            setPredictionCache(data.predictionCache ?? {});
          }
        } else if (!cancelled) {
          setStoredActiveMatchId(null);
          setPredictionCache({});
        }
      } catch {
        if (!cancelled) {
          setStoredActiveMatchId(null);
          setPredictionCache({});
        }
      } finally {
        if (!cancelled) {
          setPredictionCacheHydrated(true);
        }
      }
    }

    void loadPredictionState();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.token, predictionCacheStorageKey]);

  useEffect(() => {
    if (!predictionCacheHydrated || !predictionCacheStorageKey) return;
    const activeMatchId = activeMatch?.id ?? storedActiveMatchId ?? null;
    if (!currentUser?.token) return;
    void fetch(appPath("/api/user/predictions"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({ activeMatchId, predictionCache }),
    }).catch(() => undefined);
  }, [
    activeMatch?.id,
    currentUser?.token,
    predictionCache,
    predictionCacheHydrated,
    predictionCacheStorageKey,
    storedActiveMatchId,
  ]);

  const chinaDates = useMemo(
    () => Array.from(new Set(matches.map(getChinaDateKey))).sort(),
    [matches],
  );

  useEffect(() => {
    if (chinaDates.length > 0 && !chinaDates.includes(activeDate)) {
      setActiveDate(chinaDates[0]);
    }
  }, [activeDate, chinaDates]);

  const dayMatches = useMemo(
    () => matches.filter((match) => getChinaDateKey(match) === activeDate),
    [matches, activeDate],
  );

  useEffect(() => {
    if (
      matches.length === 0 ||
      activeMatch ||
      !activeMatchStorageKey ||
      !predictionCacheHydrated
    ) {
      return;
    }
    const storedMatchId = storedActiveMatchId ?? localStorage.getItem(activeMatchStorageKey);
    const storedMatch = matches.find((match) => match.id === storedMatchId);
    if (storedMatch) setActiveMatch(storedMatch);
  }, [activeMatch, activeMatchStorageKey, matches, predictionCacheHydrated, storedActiveMatchId]);

  const heroMatches = useMemo(() => {
    const sorted = [...matches].sort(
      (a, b) => toUtcFromVenueTime(a).getTime() - toUtcFromVenueTime(b).getTime(),
    );
    // 优先展示「即将开赛」的比赛；若全部已结束，退回展示最近两场。
    const upcoming = sorted.filter((match) => match.status !== "finished");
    return (upcoming.length > 0 ? upcoming : sorted.slice(-2)).slice(0, 2);
  }, [matches]);

  if (!authLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-sm text-white/55">
        加载中...
      </main>
    );
  }

  if (!currentUser?.token) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <main className="min-h-screen overflow-hidden px-5 pb-16 pt-6">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <a className="flex items-center gap-3" href="#top" aria-label="世界杯 2026 智能预测">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-host-gradient text-lg font-black text-white shadow-glow">
            赛
          </span>
          <span>
            <span className="block text-sm font-extrabold tracking-wide text-white">
              世界杯 2026
            </span>
            <span className="block text-[11px] text-white/45">智能比分预测</span>
          </span>
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[140px] truncate text-sm font-semibold text-white/55 sm:inline">
            {currentUser.name}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-white/62 transition hover:border-white/20 hover:text-white"
          >
            退出
          </button>
        </div>
      </header>

      <section
        id="top"
        className="mx-auto grid max-w-6xl gap-8 pb-8 pt-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"
      >
        <div>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.18] tracking-normal text-white sm:text-5xl">
            世界杯 2026 预测
          </h1>
        </div>

        <div className="glass rounded-lg p-3 shadow-card">
          <div className="flex items-center justify-between border-b border-white/8 pb-2">
            <h2 className="text-base font-bold text-white">即将开赛</h2>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/25">
              北京时间
            </span>
          </div>

          <div className="mt-3 grid gap-2">
            {loading ? (
              <div className="py-8 text-center text-sm text-white/42">加载中...</div>
            ) : (
              heroMatches.map((match) => {
                const canOpen = isMatchupKnown(match) || Boolean(match.result);
                const active = activeMatch?.id === match.id;

                return (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => {
                      if (canOpen) handleOpenPrediction(match);
                    }}
                    disabled={!canOpen}
                    className={`rounded-md border border-white/8 bg-white/[0.035] px-3 py-2.5 text-left transition ${
                      active ? "hero-match-active " : ""
                    }${
                      canOpen
                        ? "hover:border-emerald-400/35 hover:bg-emerald-400/5"
                        : "cursor-default opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-white/42">
                      <span>
                        {formatChinaKickoff(match, { includeDate: false })} ·{" "}
                        {shortStage(match.stage)}
                      </span>
                      <span>{match.city}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-sm font-semibold text-white/88">
                      <span>{getTeamName(match.home)}</span>
                      <span className="text-white/30">-</span>
                      <span>{getTeamName(match.away)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section id="schedule" className="mx-auto mt-6 max-w-6xl">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-normal text-white">赛程</h2>
          <span className="text-xs text-white/42">北京时间 · {dayMatches.length} 场</span>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {chinaDates.map((date) => {
            const active = date === activeDate;

            return (
              <button
                key={date}
                type="button"
                onClick={() => setActiveDate(date)}
                className={`flex shrink-0 flex-col items-center rounded-lg px-4 py-2 text-sm transition ${
                  active
                    ? "bg-emerald-500 text-ink-900"
                    : "glass text-white/70 hover:text-white"
                }`}
              >
                <span className="font-semibold">{formatDate(date)}</span>
                <span className={`text-[10px] ${active ? "text-ink-900/70" : "text-white/40"}`}>
                  {weekday(date)}
                  {date === TODAY ? " · 今天" : ""}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="glass rounded-lg py-16 text-center text-sm text-white/42">
            加载赛程中...
          </div>
        ) : dayMatches.length === 0 ? (
          <div className="glass rounded-lg py-16 text-center text-sm text-white/42">
            当天暂无比赛
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {dayMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                active={activeMatch?.id === match.id}
                prediction={predictionCache[match.id]}
                onSelect={handleSelectMatch}
                onPredict={handleOpenPrediction}
                onRegenerate={handleRegeneratePrediction}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto mt-10 grid max-w-6xl gap-4">
        <KnowledgePanel
          selectedMatch={activeMatch}
          onCompiledChange={handleCompiledChange}
          storageKey={knowledgeStorageKey}
          authToken={currentUser.token}
          embedded
        />

        <StrategyPanel embedded />

        <ReviewPanel matches={matches} authToken={currentUser.token} embedded />
      </section>

      <PredictionDrawer
        match={selected}
        knowledgeContext={knowledgeForSelected}
        strategyConfig={strategyConfig}
        initialPrediction={selected ? predictionCache[selected.id] : undefined}
        forceRefresh={predictionRequest.forceRefresh}
        requestId={predictionRequest.requestId}
        authToken={currentUser.token}
        onBeforePredict={ensureKnowledgeForPrediction}
        onPredictionGenerated={handlePredictionGenerated}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}

function getChinaTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function readLocalPredictionCache(storageKey: string): Record<string, Prediction> {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, Prediction>)
      : {};
  } catch {
    return {};
  }
}

async function readStoredKnowledgeForPrediction(
  authToken: string,
): Promise<StoredKnowledge | null> {
  const response = await fetch(appPath("/api/user/knowledge"), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (response.ok) return (await response.json()) as StoredKnowledge;
  if (response.status === 401) {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    throw new Error("登录已失效，请重新登录。");
  }
  if (response.status === 503) {
    throw new Error("登录服务暂时不可用。");
  }
  throw new Error("读取知识库失败。");
}

async function saveStoredKnowledgeForPrediction(
  authToken: string,
  storageKey: string,
  state: StoredKnowledge,
) {
  const response = await fetch(appPath("/api/user/knowledge"), {
    method: "PUT",
    headers: jsonHeaders(authToken),
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error("知识库保存失败。");
}

async function compileExistingKnowledge(
  items: KnowledgeItem[],
  authToken: string,
): Promise<KnowledgeApiResponse> {
  const response = await fetch(appPath("/api/knowledge/compile"), {
    method: "POST",
    headers: jsonHeaders(authToken),
    body: JSON.stringify({ items }),
  });
  const data = (await response.json()) as KnowledgeApiResponse;
  if (!response.ok || data.error) throw new Error(data.error ?? "知识库整理失败。");
  return data;
}

async function searchKnowledgeForMatch(
  match: Match,
  authToken: string,
  existingItems: KnowledgeItem[] = [],
): Promise<KnowledgeApiResponse> {
  const response = await fetch(appPath("/api/knowledge/search"), {
    method: "POST",
    headers: jsonHeaders(authToken),
    body: JSON.stringify({
      query: buildDefaultKnowledgeSearchQuery(match),
      matchId: match.id,
      existingItems,
    }),
  });
  const data = (await response.json()) as KnowledgeApiResponse;
  if (!response.ok || data.error) throw new Error(data.error ?? "自动联网搜索失败。");
  return data;
}

function jsonHeaders(authToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };
}

function buildDefaultKnowledgeSearchQuery(match: Match): string {
  const homeName = getTeamName(match.home);
  const awayName = getTeamName(match.away);
  const homeNameEn = getTeamNameEn(match.home);
  const awayNameEn = getTeamNameEn(match.away);

  return [
    "World Cup 2026",
    `${homeName} ${homeNameEn}`,
    "vs",
    `${awayName} ${awayNameEn}`,
    match.date,
    "latest odds ranking injury lineup team news weather head to head form",
  ].join(" ");
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

function knowledgeItemKey(item: KnowledgeItem): string {
  if (item.sourceUrl) return `url:${item.sourceUrl}`;
  return `text:${item.matchId ?? "global"}|${item.title.toLowerCase()}|${item.content
    .slice(0, 96)
    .toLowerCase()}`;
}
