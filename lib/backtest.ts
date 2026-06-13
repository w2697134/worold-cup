import { getTeamName } from "./data";
import type { ExtractedIntelligence } from "./intelligence";
import { strategyMap } from "./strategies";
import type {
  Match,
  Prediction,
  PredictionStrategyConfig,
  PredictionStrategyId,
  StrategyBacktestResult,
} from "./types";

type Probabilities = Prediction["probabilities"];
type Outcome = NonNullable<StrategyBacktestResult["outcome"]>;

interface HistoricalSample {
  outcome: Outcome;
  exact: boolean;
  fragment: string;
}

interface Candidate {
  id: PredictionStrategyId;
  strategy: string;
  outcome: Outcome;
  samples: HistoricalSample[];
  priority: number;
}

export function runSimilarMatchBacktest(
  match: Match,
  intelligence: ExtractedIntelligence,
  ratingEdge: number,
  strategyConfig?: PredictionStrategyConfig,
): StrategyBacktestResult {
  const samples = extractHistoricalSamples(match, intelligence.text).slice(0, 12);
  if (samples.length === 0) {
    return {
      strategy: "数据不足",
      hitRate: null,
      sampleSize: 0,
      hits: 0,
      note: "没有可验证的历史样本，回测不参与概率修正。",
    };
  }

  const strategies = strategyMap(strategyConfig);
  const candidates: Candidate[] = [];
  const addCandidate = (
    id: PredictionStrategyId,
    outcome: Outcome | undefined,
    candidateSamples: HistoricalSample[],
  ) => {
    if (!outcome) return;
    const strategy = strategies.get(id);
    if (!strategy?.enabled) return;
    candidates.push({
      id,
      strategy: strategy.name,
      outcome,
      samples: candidateSamples,
      priority: strategy.priority,
    });
  };

  const marketOutcome = intelligence.marketProbabilities
    ? outcomeFromProbabilities(intelligence.marketProbabilities)
    : undefined;
  addCandidate("market", marketOutcome, samples);

  addCandidate("ranking", outcomeFromRatingEdge(ratingEdge), samples);

  const exactSamples = samples.filter((sample) => sample.exact);
  const h2hOutcome = exactSamples.length >= 2 ? majorityOutcome(exactSamples) : undefined;
  addCandidate("h2h", h2hOutcome, exactSamples);

  const formOutcome = samples.length >= 2 ? majorityOutcome(samples) : undefined;
  addCandidate("form", formOutcome, samples);

  if (candidates.length === 0) {
    return {
      strategy: "无可用策略",
      hitRate: null,
      sampleSize: 0,
      hits: 0,
      note: "当前策略已关闭或缺少对应情报，回测不参与概率修正。",
    };
  }

  const scored = candidates
    .map((candidate) => scoreCandidate(candidate))
    .sort((a, b) => b.hitRate - a.hitRate || b.sampleSize - a.sampleSize || b.priority - a.priority);

  const best = scored[0];
  const notePrefix =
    best.sampleSize < 3
      ? "样本很少，只作提醒，回测不参与概率修正。"
      : "样本仅来自当前知识库中带明确赛果提示的片段，不是完整历史数据库回测。";

  return {
    strategy: best.strategy,
    outcome: best.outcome,
    hitRate: best.hitRate,
    sampleSize: best.sampleSize,
    hits: best.hits,
    note: `${notePrefix} 已识别 ${best.sampleSize} 条可解析比分。`,
  };
}

export function applyBacktestAdjustment(
  probabilities: Probabilities,
  backtest: StrategyBacktestResult,
): Probabilities {
  if (!backtest.outcome || backtest.hitRate === null || backtest.sampleSize < 3) {
    return probabilities;
  }

  const shift = backtest.hitRate >= 75 ? 4 : backtest.hitRate >= 60 ? 2 : 0;
  if (shift <= 0) return probabilities;

  if (backtest.outcome === "homeWin") {
    return normalize({
      homeWin: probabilities.homeWin + shift,
      draw: probabilities.draw - Math.ceil(shift / 2),
      awayWin: probabilities.awayWin - Math.floor(shift / 2),
    });
  }
  if (backtest.outcome === "awayWin") {
    return normalize({
      homeWin: probabilities.homeWin - Math.floor(shift / 2),
      draw: probabilities.draw - Math.ceil(shift / 2),
      awayWin: probabilities.awayWin + shift,
    });
  }
  return normalize({
    homeWin: probabilities.homeWin - Math.ceil(shift / 2),
    draw: probabilities.draw + shift,
    awayWin: probabilities.awayWin - Math.floor(shift / 2),
  });
}

function extractHistoricalSamples(match: Match, text: string): HistoricalSample[] {
  if (!text) return [];

  const seen = new Set<string>();
  const samples: HistoricalSample[] = [];
  const scorePattern = /(\d{1,2})\s*([-:：])\s*(\d{1,2})/g;

  for (const score of text.matchAll(scorePattern)) {
    const index = score.index ?? 0;
    if (isLikelyDateOrTime(text, index, score[0], score[1], score[2], score[3])) {
      continue;
    }
    const fragmentStart = Math.max(0, index - 180);
    const rawFragment = text.slice(fragmentStart, index + 90);
    const localCue = text.slice(Math.max(0, index - 24), index + score[0].length + 36);
    if (!hasResultCue(localCue)) continue;
    const sample = inferSample(match, rawFragment, index - fragmentStart, {
      first: Number(score[1]),
      second: Number(score[3]),
    });
    if (!sample) continue;

    sample.fragment = sample.fragment.replace(/\s+/g, " ");
    const key = `${sample.outcome}|${sample.exact}|${sample.fragment}`;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(sample);
  }

  return samples;
}

function isLikelyDateOrTime(
  text: string,
  index: number,
  raw: string,
  first: string,
  separator: string,
  second: string,
): boolean {
  const before = text[index - 1] ?? "";
  const after = text[index + raw.length] ?? "";
  if (Number(first) > 9 || Number(second) > 9) return true;
  if (/[-/]/.test(before) || /[-/]/.test(after)) return true;
  if ((separator === ":" || separator === "：") && first.length === 2 && second.length === 2) {
    return true;
  }

  const nearby = text.slice(Math.max(0, index - 20), index + raw.length + 20);
  return /时间|周|天气|排名|赔率|主胜|主负|让球|°|℃|C\b/i.test(nearby);
}

function hasResultCue(fragment: string): boolean {
  return /胜|负|平|战平|击败|逼平|draw|won|lost|beat|defeat/i.test(fragment);
}

function inferSample(
  match: Match,
  fragment: string,
  localScoreIndex: number,
  score: { first: number; second: number },
): HistoricalSample | null {
  const homeName = getTeamName(match.home);
  const awayName = getTeamName(match.away);
  const homeIndex = fragment.indexOf(homeName);
  const awayIndex = fragment.indexOf(awayName);
  const hasHome = homeIndex >= 0;
  const hasAway = awayIndex >= 0;

  if (!hasHome && !hasAway) return null;

  if (hasHome && hasAway) {
    const homeBeforeScore = fragment.lastIndexOf(homeName, localScoreIndex);
    const awayBeforeScore = fragment.lastIndexOf(awayName, localScoreIndex);

    if (homeBeforeScore >= 0 && homeBeforeScore > awayBeforeScore) {
      return {
        outcome: scoreOutcome(score.first, score.second),
        exact: true,
        fragment,
      };
    }
    if (awayBeforeScore >= 0 && awayBeforeScore > homeBeforeScore) {
      return {
        outcome: reverseOutcome(scoreOutcome(score.first, score.second)),
        exact: true,
        fragment,
      };
    }
  }

  if (hasHome) {
    const teamOutcome = inferTeamOutcome(fragment, homeIndex, localScoreIndex, score);
    if (!teamOutcome) return null;
    return { outcome: teamOutcome, exact: hasAway, fragment };
  }

  const awayOutcome = inferTeamOutcome(fragment, awayIndex, localScoreIndex, score);
  if (!awayOutcome) return null;
  return { outcome: reverseOutcome(awayOutcome), exact: false, fragment };
}

function inferTeamOutcome(
  fragment: string,
  teamIndex: number,
  scoreIndex: number,
  score: { first: number; second: number },
): Outcome | null {
  const localCue = fragment.slice(Math.max(0, scoreIndex - 24), scoreIndex + 42);
  if (teamIndex >= 0 && teamIndex < scoreIndex) return scoreOutcome(score.first, score.second);
  if (/平|draw/i.test(localCue)) return "draw";
  if (/胜|won|beat|defeat/i.test(localCue)) return "homeWin";
  if (/负|lost|defeated by/i.test(localCue)) return "awayWin";
  return null;
}

function scoreCandidate(candidate: Candidate) {
  const hits = candidate.samples.filter((sample) => sample.outcome === candidate.outcome).length;
  const sampleSize = candidate.samples.length;
  return {
    ...candidate,
    hits,
    sampleSize,
    hitRate: sampleSize > 0 ? Math.round((hits / sampleSize) * 100) : 0,
  };
}

function majorityOutcome(samples: HistoricalSample[]): Outcome | undefined {
  const count: Record<Outcome, number> = { homeWin: 0, draw: 0, awayWin: 0 };
  for (const sample of samples) count[sample.outcome] += 1;
  const entries = Object.entries(count) as [Outcome, number][];
  const [outcome, value] = entries.sort((a, b) => b[1] - a[1])[0];
  return value > 0 ? outcome : undefined;
}

function outcomeFromProbabilities(probabilities: Probabilities): Outcome {
  if (
    probabilities.draw >= probabilities.homeWin &&
    probabilities.draw >= probabilities.awayWin
  ) {
    return "draw";
  }
  return probabilities.homeWin >= probabilities.awayWin ? "homeWin" : "awayWin";
}

function outcomeFromRatingEdge(edge: number): Outcome {
  if (edge >= 4) return "homeWin";
  if (edge <= -4) return "awayWin";
  return "draw";
}

function scoreOutcome(first: number, second: number): Outcome {
  if (first > second) return "homeWin";
  if (first < second) return "awayWin";
  return "draw";
}

function reverseOutcome(outcome: Outcome): Outcome {
  if (outcome === "homeWin") return "awayWin";
  if (outcome === "awayWin") return "homeWin";
  return "draw";
}

function normalize(value: Probabilities): Probabilities {
  const homeWin = clamp(Math.round(value.homeWin), 0, 100);
  const draw = clamp(Math.round(value.draw), 0, 100);
  const awayWin = 100 - homeWin - draw;

  if (awayWin < 0) {
    return normalize({
      homeWin: homeWin + awayWin,
      draw,
      awayWin: 0,
    });
  }

  return { homeWin, draw, awayWin };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
