import type {
  FactorWeight,
  Match,
  PoissonModelPrediction,
  Prediction,
  PredictionStrategyConfig,
  Team,
} from "./types";
import { runSimilarMatchBacktest } from "./backtest";
import { STAR_PLAYERS, TEAM_BY_CODE } from "./data";
import { extractMatchIntelligence, rankRatingEdge } from "./intelligence";
import { buildPoissonPrediction, selectPoissonScoreline } from "./models/poisson";
import { TEAM_RATING, hostBoost } from "./team-ratings";
import { assessValue } from "./value";

type Probabilities = Prediction["probabilities"];

export function buildBaselinePrediction(
  match: Match,
  knowledgeContext?: string,
  strategyConfig?: PredictionStrategyConfig,
): Prediction {
  const home = getTeam(match.home);
  const away = getTeam(match.away);
  const intelligence = extractMatchIntelligence(knowledgeContext, match);
  const baseline = calculateBaseline(match, intelligence);
  const backtest = runSimilarMatchBacktest(match, intelligence, baseline.ratingDiff, strategyConfig);
  // 概率只用「Poisson + 盘口 + DeepSeek」固定权重融合；不再用历史命中率
  // 「挑最优策略」去调整概率（避免过拟合）。回测结果仅作展示信息。
  const probabilities = blendProbabilities(
    undefined,
    baseline.poisson.probabilities,
    intelligence.marketProbabilities,
  );
  const value = assessValue(probabilities, intelligence);

  return {
    matchId: match.id,
    probabilities,
    predictedScore: scoreFromBaseline(probabilities, baseline.ratingDiff, baseline.poisson),
    confidence: lowerConfidenceForCloseMatches(baseline.confidence, probabilities),
    keyFactors: mergeFactors(
      intelligenceFactors(intelligence, backtest),
      baselineFactors(match, home, away, baseline.ratingDiff, intelligence),
    ),
    commentary: addIntelligenceCommentary(
      baselineCommentary(home, away, probabilities),
      intelligence,
      backtest,
    ),
    keyPlayers: {
      home: {
        team: home.code,
        ...(STAR_PLAYERS[home.code] ?? { name: "待定", note: "等待临场信息" }),
      },
      away: {
        team: away.code,
        ...(STAR_PLAYERS[away.code] ?? { name: "待定", note: "等待临场信息" }),
      },
    },
    source: "stub",
    generatedAt: new Date().toISOString(),
    usedIntelligence: buildUsedIntelligence(intelligence, backtest),
    poisson: baseline.poisson,
    value,
  };
}

export function calibratePrediction(
  prediction: Prediction,
  match: Match,
  knowledgeContext?: string,
  strategyConfig?: PredictionStrategyConfig,
): Prediction {
  const intelligence = extractMatchIntelligence(knowledgeContext, match);
  const baseline = calculateBaseline(match, intelligence);
  const backtest = runSimilarMatchBacktest(match, intelligence, baseline.ratingDiff, strategyConfig);
  // 同上：纯固定权重融合，回测不参与概率计算，只作展示。
  const probabilities = blendProbabilities(
    prediction.probabilities,
    baseline.poisson.probabilities,
    intelligence.marketProbabilities,
  );
  const value = assessValue(probabilities, intelligence);

  return {
    ...prediction,
    probabilities,
    predictedScore: scoreFromBaseline(probabilities, baseline.ratingDiff, baseline.poisson),
    confidence: lowerConfidenceForCloseMatches(prediction.confidence, probabilities),
    keyFactors: mergeFactors(
      intelligenceFactors(intelligence, backtest),
      prediction.keyFactors,
      baselineFactors(match, getTeam(match.home), getTeam(match.away), baseline.ratingDiff, intelligence),
    ),
    commentary: addIntelligenceCommentary(prediction.commentary, intelligence, backtest),
    usedIntelligence: buildUsedIntelligence(intelligence, backtest),
    poisson: baseline.poisson,
    value,
  };
}

function calculateBaseline(
  match: Match,
  intelligence = extractMatchIntelligence(undefined, match),
) {
  const homeRating = TEAM_RATING[match.home] ?? 65;
  const awayRating = TEAM_RATING[match.away] ?? 65;
  const ratingDiff =
    homeRating + hostBoost(match.home, match.city) - awayRating + rankRatingEdge(intelligence.ranking);
  const draw = clamp(Math.round(28 - Math.abs(ratingDiff) * 0.35), 18, 30);
  const homeShare = 1 / (1 + Math.exp(-ratingDiff / 11));
  const decisive = 100 - draw;
  const homeWin = clamp(Math.round(decisive * homeShare), 8, 82);
  const awayWin = 100 - draw - homeWin;
  const probabilities = normalize({ homeWin, draw, awayWin });
  const poisson = buildPoissonPrediction(match, { ranking: intelligence.ranking });

  return {
    ratingDiff,
    probabilities,
    poisson,
    confidence:
      Math.abs(poisson.probabilities.homeWin - poisson.probabilities.awayWin) >= 35
        ? ("mid" as const)
        : ("low" as const),
  };
}

function blendProbabilities(
  deepseek: Probabilities | undefined,
  poisson: Probabilities,
  market?: Probabilities,
): Probabilities {
  const weights =
    deepseek && market
      ? { poisson: 0.3, market: 0.5, deepseek: 0.2 }
      : deepseek
        ? { poisson: 0.6, market: 0, deepseek: 0.4 }
        : { poisson: 1, market: 0, deepseek: 0 };

  const mixed = {
    homeWin: Math.round(
      poisson.homeWin * weights.poisson +
        (market?.homeWin ?? 0) * weights.market +
        (deepseek?.homeWin ?? 0) * weights.deepseek,
    ),
    draw: Math.round(
      poisson.draw * weights.poisson +
        (market?.draw ?? 0) * weights.market +
        (deepseek?.draw ?? 0) * weights.deepseek,
    ),
    awayWin: 0,
  };
  mixed.awayWin = 100 - mixed.homeWin - mixed.draw;
  return normalize(mixed);
}

function scoreFromBaseline(
  probabilities: Probabilities,
  ratingDiff: number,
  poisson?: PoissonModelPrediction,
) {
  if (poisson) return selectPoissonScoreline(poisson, probabilities);

  const edge = probabilities.homeWin - probabilities.awayWin;

  if (probabilities.draw >= 27 && Math.abs(edge) <= 18) return { home: 1, away: 1 };
  if (edge >= 45) return ratingDiff > 24 ? { home: 3, away: 0 } : { home: 2, away: 0 };
  if (edge >= 25) return ratingDiff >= 10 ? { home: 2, away: 1 } : { home: 1, away: 0 };
  if (edge >= 10) return probabilities.draw >= 25 ? { home: 1, away: 1 } : { home: 2, away: 1 };
  if (edge <= -45) return ratingDiff < -24 ? { home: 0, away: 3 } : { home: 0, away: 2 };
  if (edge <= -25) return { home: 1, away: 2 };
  if (edge <= -10) return probabilities.draw >= 25 ? { home: 1, away: 1 } : { home: 1, away: 2 };
  return { home: 1, away: 1 };
}

function baselineFactors(
  match: Match,
  home: Team,
  away: Team,
  ratingDiff: number,
  intelligence = extractMatchIntelligence(undefined, match),
): { label: string; weight: FactorWeight }[] {
  const host = hostBoost(match.home, match.city) > 0;
  const factors: { label: string; weight: FactorWeight }[] = [
    {
      label: host ? `${home.name}主办国优势` : "赛地中性影响",
      weight: host ? "high" : "low",
    },
    {
      label:
        Math.abs(ratingDiff) >= 12
          ? "基础实力差距较明显"
          : "基础实力接近，波动较大",
      weight: Math.abs(ratingDiff) >= 12 ? "high" : "mid",
    },
    {
      label: `${away.name}反击与定位球风险`,
      weight: "mid",
    },
  ];
  if (intelligence.ranking) {
    factors.splice(2, 0, {
      label: "FIFA 排名已纳入强弱修正",
      weight: Math.abs(intelligence.ranking.ratingEdge) >= 6 ? "high" : "mid",
    });
  }
  return factors;
}

function baselineCommentary(home: Team, away: Team, probabilities: Probabilities): string {
  const lead =
    probabilities.homeWin > probabilities.awayWin + 8
      ? `${home.name}略占上风`
      : probabilities.awayWin > probabilities.homeWin + 8
        ? `${away.name}略占上风`
        : "双方胜面接近";

  return `${lead}。这是基于球队基础强度、赛地和主办国因素的初步预测，未包含临场首发、伤停和天气等最新情报。`;
}

function lowerConfidenceForCloseMatches(
  confidence: Prediction["confidence"],
  probabilities: Probabilities,
): Prediction["confidence"] {
  const edge = Math.abs(probabilities.homeWin - probabilities.awayWin);
  if (edge < 18) return "low";
  if (confidence === "high" && edge < 30) return "mid";
  return confidence;
}

function intelligenceFactors(
  intelligence: ReturnType<typeof extractMatchIntelligence>,
  backtest: ReturnType<typeof runSimilarMatchBacktest>,
): { label: string; weight: FactorWeight }[] {
  const factors: { label: string; weight: FactorWeight }[] = [];

  if (intelligence.marketProbabilities) {
    const marketEdge =
      Math.abs(intelligence.marketProbabilities.homeWin - intelligence.marketProbabilities.awayWin);
    factors.push({
      label: `盘口折算主胜 ${intelligence.marketProbabilities.homeWin}%`,
      weight: marketEdge >= 25 ? "high" : "mid",
    });
  }

  const extraLabels = intelligence.labels.filter((label) => label !== "盘口" && label !== "排名");
  if (extraLabels.length > 0) {
    factors.push({
      label: `已参考：${extraLabels.slice(0, 4).join("、")}`,
      weight: "mid",
    });
  }

  if (backtest.sampleSize > 0 && backtest.hitRate !== null) {
    factors.push({
      label: `回测最佳：${backtest.strategy} ${backtest.hitRate}%`,
      weight: backtest.sampleSize >= 3 && backtest.hitRate >= 60 ? "mid" : "low",
    });
  }

  return factors;
}

function buildUsedIntelligence(
  intelligence: ReturnType<typeof extractMatchIntelligence>,
  backtest: ReturnType<typeof runSimilarMatchBacktest>,
): Prediction["usedIntelligence"] {
  if (intelligence.labels.length === 0 && backtest.sampleSize === 0) return undefined;

  return {
    labels: intelligence.labels,
    notes: intelligence.notes.slice(0, 5),
    marketProbabilities: intelligence.marketProbabilities,
    backtest,
    caveat: "盘口是市场折算概率，回测只基于当前知识库样本。",
  };
}

function mergeFactors(
  ...groups: { label: string; weight: FactorWeight }[][]
): { label: string; weight: FactorWeight }[] {
  const seen = new Set<string>();
  const result: { label: string; weight: FactorWeight }[] = [];

  for (const factor of groups.flat()) {
    const key = factor.label.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(factor);
    if (result.length >= 5) break;
  }

  return result;
}

function addIntelligenceCommentary(
  commentary: string,
  intelligence: ReturnType<typeof extractMatchIntelligence>,
  backtest: ReturnType<typeof runSimilarMatchBacktest>,
): string {
  const additions: string[] = [];
  if (intelligence.labels.length > 0) {
    additions.push(`已参考${intelligence.labels.slice(0, 5).join("、")}。`);
  }
  if (backtest.sampleSize > 0 && backtest.hitRate !== null) {
    additions.push(`相似样本回测：${backtest.strategy} ${backtest.hits}/${backtest.sampleSize}。`);
  }
  if (additions.length === 0) return commentary;
  return `${commentary} ${additions.join("")}`.slice(0, 260);
}

function getTeam(code: string): Team {
  const team = TEAM_BY_CODE[code];
  if (!team) throw new Error(`Unknown team: ${code}`);
  return team;
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
