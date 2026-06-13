"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Match, PredictionOutcome, ReviewMatchResult, ReviewSummary } from "@/lib/types";
import { getTeamName } from "@/lib/data";
import { appPath } from "@/lib/base-path";
import { ChevronToggle } from "@/components/ChevronToggle";

interface ReviewPayload {
  results: ReviewMatchResult[];
  summary: ReviewSummary;
  generatedAt: string;
}

interface ReviewResponse extends Partial<ReviewPayload> {
  error?: string;
}

const OUTCOME_LABEL: Record<PredictionOutcome, string> = {
  homeWin: "主胜",
  draw: "平局",
  awayWin: "客胜",
};

export function ReviewPanel({ matches, embedded = false }: { matches: Match[]; embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchById = useMemo(
    () => new Map(matches.map((match) => [match.id, match])),
    [matches],
  );

  async function runReview() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(appPath("/api/review"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as ReviewResponse;

      if (!response.ok || data.error || !data.results || !data.summary || !data.generatedAt) {
        throw new Error(data.error ?? "复盘失败");
      }

      setPayload({
        results: data.results,
        summary: data.summary,
        generatedAt: data.generatedAt,
      });
    } catch (nextError) {
      setPayload(null);
      setError(nextError instanceof Error ? nextError.message : "复盘失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="review"
      className={embedded ? "" : "mx-auto mt-10 max-w-6xl"}
    >
      <div className="glass h-full min-h-[126px] rounded-lg p-6 shadow-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
          className="grid min-h-[78px] cursor-pointer grid-cols-[1fr_auto] items-center gap-6 rounded-md outline-none transition hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <div>
            <h2 className="text-2xl font-extrabold tracking-normal text-white">模型复盘</h2>
            {!open && <p className="mt-2 text-sm font-semibold text-white/70">已完赛样本</p>}
          </div>
          <ChevronToggle
            open={open}
            onClick={() => setOpen((current) => !current)}
            label={open ? "收起模型复盘" : "展开模型复盘"}
          />
        </div>

        {open && (
          <div className="mt-5">
            {!payload && !loading && !error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.035] p-4">
                <p className="text-sm font-semibold text-white/62">查看已完赛比赛的预测表现。</p>
                <button
                  type="button"
                  onClick={runReview}
                  className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-900 transition hover:bg-emerald-400"
                >
                  开始复盘
                </button>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] py-10 text-sm text-white/55">
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                正在计算历史结果
              </div>
            )}

            {error && !loading && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                {error}
              </div>
            )}

            {payload && !loading && (
              <div>
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={runReview}
                    className="rounded-md bg-white/8 px-4 py-2 text-sm font-bold text-white/72 transition hover:bg-white/12 hover:text-white"
                  >
                    刷新
                  </button>
                </div>

                {payload.summary.count === 0 ? (
                  <div className="rounded-lg border border-white/8 bg-white/[0.035] p-4 text-sm text-white/50">
                    暂无可复盘的已完赛比分。
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Metric label="样本 N" value={String(payload.summary.count)} />
                      <Metric label="1X2 命中率" value={formatRate(payload.summary.outcomeHitRate)} />
                      <Metric label="比分命中率" value={formatRate(payload.summary.scoreHitRate)} />
                      <Metric
                        label="平均 Brier"
                        value={formatBrier(payload.summary.avgBrier)}
                        title="Brier 评分，0 表示完美，越小越好。"
                      />
                    </div>

                    <div className="mt-5 divide-y divide-white/8 overflow-hidden rounded-lg border border-white/8">
                      {payload.results.map((result) => (
                        <ReviewRow
                          key={result.matchId}
                          result={result}
                          match={matchById.get(result.matchId)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.035] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40" title={title}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-emerald-300">{value}</p>
    </div>
  );
}

function ReviewRow({ result, match }: { result: ReviewMatchResult; match?: Match }) {
  const matchup = match
    ? `${getTeamName(match.home)} vs ${getTeamName(match.away)}`
    : result.matchId;

  return (
    <div className="grid gap-3 bg-white/[0.025] px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-white/85">{matchup}</p>
        <p className="mt-1 text-xs text-white/45">
          推荐 {scoreText(result.predicted.score)}
          {result.predicted.expectedGoals
            ? ` · 预期进球 ${expectedGoalsText(result.predicted.expectedGoals)}`
            : ""}{" "}
          · 实际 {scoreText(result.actual.score)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Badge hit={result.outcomeHit}>
          1X2 {result.outcomeHit ? "命中" : "未中"} · {OUTCOME_LABEL[result.predicted.outcome]}
        </Badge>
        <Badge hit={result.scoreHit}>比分 {result.scoreHit ? "命中" : "未中"}</Badge>
        <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-semibold text-white/55">
          Brier {result.brier.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

function Badge({ hit, children }: { hit: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
        hit
          ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
          : "bg-white/8 text-white/50 ring-white/12"
      }`}
    >
      {children}
    </span>
  );
}

function scoreText(score: { home: number; away: number }): string {
  return `${score.home}:${score.away}`;
}

function expectedGoalsText(score: { home: number; away: number }): string {
  return `${score.home.toFixed(2)}:${score.away.toFixed(2)}`;
}

function formatRate(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function formatBrier(value: number | null): string {
  return value === null ? "-" : value.toFixed(3);
}
