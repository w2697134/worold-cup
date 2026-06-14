"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { FactorWeight, Match, Prediction, PredictionStrategyConfig } from "@/lib/types";
import { getTeamName, isMatchupKnown, isPredictableMatch } from "@/lib/data";
import { formatChinaKickoff } from "@/lib/time";
import { appPath } from "@/lib/base-path";
import { Flag } from "./Flag";
import { ProbabilityBar } from "./ProbabilityBar";

const WEIGHT_STYLE: Record<FactorWeight, string> = {
  high: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  mid: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  low: "bg-white/10 text-white/55 ring-white/15",
};

const WEIGHT_LABEL: Record<FactorWeight, string> = {
  high: "高",
  mid: "中",
  low: "低",
};

const CONFIDENCE_LABEL: Record<Prediction["confidence"], string> = {
  high: "信心较高",
  mid: "信心一般",
  low: "信心较低",
};

const OUTCOME_LABEL: Record<"homeWin" | "draw" | "awayWin", string> = {
  homeWin: "主胜",
  draw: "平局",
  awayWin: "客胜",
};

const VALUE_OUTCOME_LABEL: Record<"home" | "draw" | "away", string> = {
  home: "主胜",
  draw: "平局",
  away: "客胜",
};

export function PredictionDrawer({
  match,
  knowledgeContext,
  strategyConfig,
  initialPrediction,
  forceRefresh = false,
  requestId = 0,
  authToken,
  onBeforePredict,
  onPredictionGenerated,
  onClose,
}: {
  match: Match | null;
  knowledgeContext?: string;
  strategyConfig?: PredictionStrategyConfig;
  initialPrediction?: Prediction;
  forceRefresh?: boolean;
  requestId?: number;
  authToken?: string;
  onBeforePredict?: (match: Match, currentKnowledgeContext: string) => Promise<string>;
  onPredictionGenerated?: (prediction: Prediction) => void;
  onClose: () => void;
}) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("生成中...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 已结束、进行中、或淘汰赛球队未定时，不生成赛前预测。
    if (!match || match.status === "finished" || !isPredictableMatch(match)) {
      setPrediction(null);
      setError(null);
      setLoading(false);
      setLoadingLabel("生成中...");
      return;
    }

    const cachedPrediction =
      initialPrediction?.matchId === match.id ? initialPrediction : undefined;
    if (cachedPrediction && !forceRefresh) {
      setPrediction(cachedPrediction);
      setError(null);
      setLoading(false);
      setLoadingLabel("生成中...");
      return;
    }

    let cancelled = false;
    setPrediction(null);
    setError(null);
    setLoading(true);
    setLoadingLabel("先整理情报...");

    void (async () => {
      const preparedKnowledgeContext = onBeforePredict
        ? await onBeforePredict(match, knowledgeContext ?? "")
        : knowledgeContext;

      if (cancelled) return;
      setLoadingLabel("生成预测...");

      const response = await fetch(appPath("/api/predict"), {
        method: "POST",
        headers: jsonHeaders(authToken),
        body: JSON.stringify({
          matchId: match.id,
          knowledgeContext: preparedKnowledgeContext,
          strategyConfig,
        }),
      });

        const data = (await response.json()) as { prediction?: Prediction; error?: string };
        if (!response.ok || data.error) {
          throw new Error(data.error ?? "预测失败");
        }
        const nextPrediction = data.prediction;
        if (cancelled) return;
        setPrediction(nextPrediction ?? null);
        if (nextPrediction) onPredictionGenerated?.(nextPrediction);
    })()
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(friendlyError(nextError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingLabel("生成中...");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    forceRefresh,
    initialPrediction?.matchId,
    knowledgeContext,
    match,
    authToken,
    onBeforePredict,
    onPredictionGenerated,
    requestId,
    strategyConfig,
  ]);

  const open = Boolean(match);
  const finished = Boolean(match && match.status === "finished");
  const hasFinalScore = Boolean(match?.result);
  const canPredict = Boolean(match && isPredictableMatch(match));
  const matchupKnown = Boolean(match && isMatchupKnown(match));
  const blockedReason =
    !match || finished || canPredict
      ? ""
      : !matchupKnown
        ? "球队还没确定，等晋级结果出来后再预测。"
        : match.status === "live"
          ? "比赛已经开始，暂不生成赛前预测。"
          : "比赛已结束，等待赛果更新。";

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/65 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-ink-800/95 shadow-card transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {match && (
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-300/80">
                  {match.stage}
                </p>
                <p className="mt-1 truncate text-xs text-white/45">
                  北京时间 {formatChinaKickoff(match)} · {match.city}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                aria-label="关闭预测抽屉"
              >
                关闭
              </button>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <TeamBlock code={match.home} name={getTeamName(match.home)} />
              <div className="flex min-w-[108px] flex-col items-center">
                {hasFinalScore && match?.result ? (
                  <span className="font-display text-5xl font-semibold tracking-normal text-white">
                    {match.result.home}
                    <span className="mx-1 text-white/35">:</span>
                    {match.result.away}
                  </span>
                ) : !finished && prediction ? (
                  <span className="font-display text-5xl font-semibold tracking-normal text-white">
                    {prediction.predictedScore.home}
                    <span className="mx-1 text-white/35">:</span>
                    {prediction.predictedScore.away}
                  </span>
                ) : (
                  <span className="font-display text-3xl text-white/25">--:--</span>
                )}
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  {hasFinalScore ? "最终比分" : finished ? "赛果待更新" : canPredict ? "预测比分" : "暂无预测"}
                </span>
                {!finished && prediction?.poisson && (
                  <span className="mt-1 text-[11px] text-white/45">
                    预期进球 {prediction.poisson.expectedGoals.home.toFixed(2)}:
                    {prediction.poisson.expectedGoals.away.toFixed(2)}
                  </span>
                )}
              </div>
              <TeamBlock code={match.away} name={getTeamName(match.away)} alignRight />
            </div>

            {finished && (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-white/8 bg-white/[0.035] py-4 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                  本场已结束
                </span>
                <span className="text-white/45">
                  {hasFinalScore ? "已展示最终比分，不再生成预测" : "等待赛果更新，不再展示旧预测"}
                </span>
              </div>
            )}

            {blockedReason && (
              <div className="rounded-lg border border-white/8 bg-white/[0.035] p-4 text-sm leading-6 text-white/58">
                {blockedReason}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] py-10 text-sm text-white/55">
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                {loadingLabel}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                预测失败：{error}
              </div>
            )}

            {!finished && prediction && (
              <div className="flex flex-col gap-6">
                <section>
                  <SectionTitle>胜平负概率</SectionTitle>
                  <div className="glass rounded-lg p-4">
                    <ProbabilityBar {...prediction.probabilities} />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
                        {CONFIDENCE_LABEL[prediction.confidence]}
                      </span>
                      {prediction.source === "skill" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-sky-400/30">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                          智能分析
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-400/30">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          基础预测
                        </span>
                      )}
                    </div>
                    {prediction.usedIntelligence && (
                      <div className="mt-3 border-t border-white/8 pt-3">
                        {prediction.usedIntelligence.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[11px] text-white/38">已参考</span>
                            {prediction.usedIntelligence.labels.slice(0, 6).map((label) => (
                              <span
                                key={label}
                                className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/62"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                        {prediction.usedIntelligence.backtest &&
                          prediction.usedIntelligence.backtest.sampleSize > 0 && (
                            <p className="mt-2 text-[11px] leading-5 text-white/48">
                              回测：{prediction.usedIntelligence.backtest.strategy}
                              {prediction.usedIntelligence.backtest.outcome
                                ? ` · ${OUTCOME_LABEL[prediction.usedIntelligence.backtest.outcome]}`
                                : ""}
                              {prediction.usedIntelligence.backtest.hitRate !== null
                                ? ` · ${prediction.usedIntelligence.backtest.hits}/${prediction.usedIntelligence.backtest.sampleSize}`
                                : ""}
                            </p>
                          )}
                        {prediction.usedIntelligence.notes[0] && (
                          <p className="mt-2 text-[11px] leading-5 text-white/42">
                            {prediction.usedIntelligence.notes[0]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {prediction.poisson && (
                  <section>
                    <SectionTitle>进球预期</SectionTitle>
                    <div className="glass rounded-lg p-4">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <Metric label="主队" value={prediction.poisson.expectedGoals.home.toFixed(2)} />
                        <Metric label="客队" value={prediction.poisson.expectedGoals.away.toFixed(2)} />
                        <Metric label="合计" value={prediction.poisson.expectedGoals.total.toFixed(2)} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                        <Metric label="3球及以上" value={`${prediction.poisson.totals.over2_5}%`} />
                        <Metric label="2球及以下" value={`${prediction.poisson.totals.under2_5}%`} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {prediction.poisson.topScores.slice(0, 5).map((score) => (
                          <span
                            key={`${score.home}-${score.away}`}
                            className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/62"
                          >
                            {score.home}:{score.away} · {score.probability.toFixed(1)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {prediction.value && (
                  <section>
                    <SectionTitle>价值观察</SectionTitle>
                    <div className="glass rounded-lg p-4">
                      {prediction.value.hasValue ? (
                        <div className="flex flex-col gap-2">
                          {prediction.value.picks.map((pick) => (
                            <div
                              key={pick.outcome}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="font-semibold text-white/85">
                                {VALUE_OUTCOME_LABEL[pick.outcome]}
                              </span>
                              <span className="text-right text-xs leading-5 text-white/58">
                                Edge {formatSignedPercent(pick.edge)} · EV{" "}
                                {formatSignedDecimal(pick.ev)} · Kelly{" "}
                                {(pick.kellyFraction * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-white/58">暂无正 EV 选择</p>
                      )}
                      <p className="mt-2 border-t border-white/8 pt-2 text-[11px] leading-5 text-white/42">
                        {prediction.value.note}
                      </p>
                    </div>
                  </section>
                )}

                <section>
                  <SectionTitle>关键因素</SectionTitle>
                  <ul className="flex flex-col gap-2">
                    {prediction.keyFactors.map((factor) => (
                      <li
                        key={factor.label}
                        className="glass flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm"
                      >
                        <span className="text-white/80">{factor.label}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${WEIGHT_STYLE[factor.weight]}`}
                        >
                          {WEIGHT_LABEL[factor.weight]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <SectionTitle>解读</SectionTitle>
                  <p className="glass rounded-lg p-4 text-sm leading-6 text-white/75">
                    {prediction.commentary}
                  </p>
                </section>

                <section>
                  <SectionTitle>关键球员</SectionTitle>
                  <div className="grid grid-cols-2 gap-3">
                    {[prediction.keyPlayers.home, prediction.keyPlayers.away].map((player) => (
                      <div key={player.team} className="glass rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <Flag code={player.team} size={26} />
                          <span className="truncate text-sm font-semibold text-white/90">
                            {player.name}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-white/55">{player.note}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function jsonHeaders(authToken?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

function TeamBlock({
  code,
  name,
  alignRight = false,
}: {
  code: string;
  name: string;
  alignRight?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${alignRight ? "items-end text-right" : ""}`}>
      <Flag code={code} size={56} />
      <span className="max-w-full truncate text-sm font-semibold text-white">{name}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-white/42">
      {children}
    </h3>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.045] px-2 py-2">
      <p className="text-[10px] text-white/38">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white/82">{value}</p>
    </div>
  );
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatSignedDecimal(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/prediction failed|fetch failed|network|ENOTFOUND|ECONN|timeout/i.test(raw)) {
    return "预测暂时失败，请稍后再试。";
  }
  if (/invalid JSON body|unknown matchId|team codes/i.test(raw)) {
    return "这场比赛信息不完整，请刷新页面后再试。";
  }
  return raw || "预测暂时失败，请稍后再试。";
}
