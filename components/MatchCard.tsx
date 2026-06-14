import type { Match, Prediction } from "@/lib/types";
import { getTeamName, isMatchupKnown, isPredictableMatch } from "@/lib/data";
import { formatChinaKickoff } from "@/lib/time";
import { Flag } from "./Flag";

const STATUS_LABEL: Record<Match["status"], string> = {
  upcoming: "未开赛",
  live: "进行中",
  finished: "已结束",
};

export function MatchCard({
  match,
  active = false,
  prediction,
  onSelect,
  onPredict,
  onRegenerate,
}: {
  match: Match;
  active?: boolean;
  prediction?: Prediction;
  onSelect: (match: Match) => void;
  onPredict: (match: Match) => void;
  onRegenerate: (match: Match) => void;
}) {
  const finished = match.status === "finished";
  const canPredict = isPredictableMatch(match);
  const showPrediction = !finished && prediction;
  const helperLabel =
    match.status === "live" ? "进行中" : isMatchupKnown(match) ? "已结束" : "球队待定";

  return (
    <article
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={() => onSelect(match)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(match);
        }
      }}
      className={`glass glass-hover relative flex min-h-[208px] cursor-pointer flex-col rounded-lg p-5 outline-none focus:ring-2 focus:ring-emerald-300 ${
        active ? "match-card-active" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-wide text-white/45">
        <span className="truncate font-semibold text-emerald-300/80">{match.stage}</span>
        <span
          className={
            match.status === "finished"
              ? "shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-white/60"
              : "shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300"
          }
        >
          {formatChinaKickoff(match, { includeDate: false })} · {STATUS_LABEL[match.status]}
        </span>
      </div>

      <div className="mt-5 flex flex-1 items-center justify-between gap-3">
        <TeamSide code={match.home} name={getTeamName(match.home)} />

        <div className="flex w-16 shrink-0 flex-col items-center px-2">
          {match.result ? (
            <span className="font-display text-3xl leading-none tracking-wider text-white">
              {match.result.home}:{match.result.away}
            </span>
          ) : showPrediction ? (
            <div className="flex flex-col items-center gap-1">
              <span className="rounded-full bg-emerald-400/14 px-2 py-0.5 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-300/25">
                预测
              </span>
              <span className="font-display text-2xl leading-none tracking-wider text-white">
                {prediction.predictedScore.home}:{prediction.predictedScore.away}
              </span>
              <span className="font-display text-sm leading-none text-white/28">对阵</span>
            </div>
          ) : finished ? (
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-sm font-bold leading-tight text-white/65">待更新</span>
              <span className="text-[11px] font-semibold text-white/32">赛果</span>
            </div>
          ) : (
            <span className="font-display text-lg leading-none text-white/30">对阵</span>
          )}
        </div>

        <TeamSide code={match.away} name={getTeamName(match.away)} alignRight />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-[11px] text-white/40">
        <span className="min-w-0 truncate">
          {match.city} · {match.venue}
        </span>
        {canPredict ? (
          prediction ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPredict(match);
                }}
                className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                查看
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRegenerate(match);
                }}
                className="rounded-full bg-emerald-500/90 px-3.5 py-1.5 text-xs font-semibold text-ink-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                重新预测
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPredict(match);
              }}
              className="shrink-0 rounded-full bg-emerald-500/90 px-3.5 py-1.5 text-xs font-semibold text-ink-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              预测
            </button>
          )
        ) : (
          !finished && (
            <span className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/45">
              {helperLabel}
            </span>
          )
        )}
      </div>
    </article>
  );
}

function TeamSide({
  code,
  name,
  alignRight = false,
}: {
  code: string;
  name: string;
  alignRight?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2.5 ${
        alignRight ? "flex-row-reverse text-right" : ""
      }`}
    >
      <Flag code={code} size={38} />
      <span className="truncate text-sm font-semibold text-white/90">{name}</span>
    </div>
  );
}
