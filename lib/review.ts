import { buildBaselinePrediction } from "./prediction-baseline";
import type {
  Match,
  Prediction,
  PredictionOutcome,
  ReviewMatchResult,
  ReviewSummary,
} from "./types";

type MatchResult = NonNullable<Match["result"]>;

const OUTCOMES: PredictionOutcome[] = ["homeWin", "draw", "awayWin"];

export function reviewMatch(match: Match): ReviewMatchResult {
  if (!match.result) {
    throw new Error(`Cannot review match without a result: ${match.id}`);
  }

  const prediction = buildBaselinePrediction(match);
  const predictedOutcome = pickOutcome(prediction.probabilities);
  const actualOutcome = outcomeFromScore(match.result);

  return {
    matchId: match.id,
    predicted: {
      probabilities: prediction.probabilities,
      score: prediction.predictedScore,
      expectedGoals: prediction.poisson?.expectedGoals,
      outcome: predictedOutcome,
    },
    actual: {
      score: match.result,
      outcome: actualOutcome,
    },
    outcomeHit: predictedOutcome === actualOutcome,
    scoreHit: scoresEqual(prediction.predictedScore, match.result),
    brier: calculateBrier(prediction.probabilities, actualOutcome),
  };
}

export function summarize(results: ReviewMatchResult[]): ReviewSummary {
  const count = results.length;

  if (count === 0) {
    return {
      count: 0,
      outcomeHitRate: null,
      scoreHitRate: null,
      avgBrier: null,
    };
  }

  const outcomeHits = results.filter((result) => result.outcomeHit).length;
  const scoreHits = results.filter((result) => result.scoreHit).length;
  const brierTotal = results.reduce((sum, result) => sum + result.brier, 0);

  return {
    count,
    outcomeHitRate: roundPercent(outcomeHits / count),
    scoreHitRate: roundPercent(scoreHits / count),
    avgBrier: roundBrier(brierTotal / count),
  };
}

function pickOutcome(probabilities: Prediction["probabilities"]): PredictionOutcome {
  return OUTCOMES.reduce((best, outcome) =>
    probabilities[outcome] > probabilities[best] ? outcome : best,
  );
}

function outcomeFromScore(score: MatchResult): PredictionOutcome {
  if (score.home > score.away) return "homeWin";
  if (score.home < score.away) return "awayWin";
  return "draw";
}

function calculateBrier(
  probabilities: Prediction["probabilities"],
  actual: PredictionOutcome,
): number {
  const value = OUTCOMES.reduce((sum, outcome) => {
    const probability = probabilities[outcome] / 100;
    const observed = outcome === actual ? 1 : 0;
    return sum + (probability - observed) ** 2;
  }, 0);

  return roundBrier(value);
}

function scoresEqual(left: MatchResult, right: MatchResult): boolean {
  return left.home === right.home && left.away === right.away;
}

function roundPercent(value: number): number {
  return Number((value * 100).toFixed(1));
}

function roundBrier(value: number): number {
  return Number(value.toFixed(4));
}
