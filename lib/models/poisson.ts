import type { Match, PoissonModelPrediction, Prediction } from "../types";
import { rankRatingEdge, type RankingIntel } from "../intelligence";
import { TEAM_RATING, hostGoalAdvantage } from "../team-ratings";

type Probabilities = Prediction["probabilities"];

interface PoissonOptions {
  ranking?: RankingIntel;
  maxGoals?: number;
  rho?: number;
}

interface ScoreCell {
  home: number;
  away: number;
  probability: number;
}

const DEFAULT_MAX_GOALS = 6;
const DEFAULT_RHO = -0.06;

export function buildPoissonPrediction(
  match: Match,
  options: PoissonOptions = {},
): PoissonModelPrediction {
  const maxGoals = options.maxGoals ?? DEFAULT_MAX_GOALS;
  const rho = options.rho ?? DEFAULT_RHO;
  const homeRating = TEAM_RATING[match.home] ?? 65;
  const awayRating = TEAM_RATING[match.away] ?? 65;
  const rankingEdge = rankRatingEdge(options.ranking);
  const neutralRatingDiff = homeRating - awayRating + rankingEdge;
  const hostAdvantage = hostGoalAdvantage(match.home, match.city);
  const expectedGoals = deriveExpectedGoals(
    homeRating,
    awayRating,
    neutralRatingDiff,
    hostAdvantage,
  );

  const cells = enumerateScoreMatrix(
    expectedGoals.home,
    expectedGoals.away,
    maxGoals,
    rho,
  );
  const homeWin = cells
    .filter((cell) => cell.home > cell.away)
    .reduce((sum, cell) => sum + cell.probability, 0);
  const draw = cells
    .filter((cell) => cell.home === cell.away)
    .reduce((sum, cell) => sum + cell.probability, 0);
  const over2_5 = cells
    .filter((cell) => cell.home + cell.away > 2.5)
    .reduce((sum, cell) => sum + cell.probability, 0);

  return {
    expectedGoals: {
      home: round2(expectedGoals.home),
      away: round2(expectedGoals.away),
      total: round2(expectedGoals.home + expectedGoals.away),
      hostAdvantage: round2(hostAdvantage),
    },
    probabilities: normalizeOutcomeProbabilities({
      homeWin: homeWin * 100,
      draw: draw * 100,
      awayWin: (1 - homeWin - draw) * 100,
    }),
    totals: normalizePair(over2_5 * 100),
    topScores: cells
      .slice()
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5)
      .map(toPercentScoreline),
    scoreMatrix: cells.map(toPercentScoreline),
  };
}

export function selectPoissonScoreline(
  poisson: PoissonModelPrediction,
  targetProbabilities?: Probabilities,
): { home: number; away: number } {
  const target = targetProbabilities
    ? outcomeFromProbabilities(targetProbabilities)
    : undefined;
  const candidates = target
    ? poisson.scoreMatrix.filter((score) => scoreOutcome(score.home, score.away) === target)
    : poisson.scoreMatrix;
  const edge = targetProbabilities
    ? Math.abs(targetProbabilities.homeWin - targetProbabilities.awayWin)
    : 0;
  const cleanFavorite =
    target && edge >= 30
      ? candidates
          .filter((score) =>
            target === "home"
              ? score.away === 0 && score.home >= 2
              : target === "away"
                ? score.home === 0 && score.away >= 2
                : false,
          )
          .slice()
          .sort(
            (a, b) =>
              representativeScore(a, poisson, target, targetProbabilities) -
              representativeScore(b, poisson, target, targetProbabilities),
          )[0]
      : undefined;

  const score =
    cleanFavorite ??
    candidates
      .slice()
      .sort(
        (a, b) =>
          representativeScore(a, poisson, target, targetProbabilities) -
          representativeScore(b, poisson, target, targetProbabilities),
      )[0] ??
    poisson.topScores[0] ??
    { home: 1, away: 1 };
  return { home: score.home, away: score.away };
}

export function poissonPmf(lambda: number, goals: number): number {
  if (goals < 0 || !Number.isInteger(goals)) return 0;
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

export function dixonColesAdjustment(
  homeGoals: number,
  awayGoals: number,
  homeLambda: number,
  awayLambda: number,
  rho = DEFAULT_RHO,
): number {
  if (homeGoals === 0 && awayGoals === 0) {
    return Math.max(0.05, 1 - homeLambda * awayLambda * rho);
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return Math.max(0.05, 1 + homeLambda * rho);
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return Math.max(0.05, 1 + awayLambda * rho);
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return Math.max(0.05, 1 - rho);
  }
  return 1;
}

function deriveExpectedGoals(
  homeRating: number,
  awayRating: number,
  neutralRatingDiff: number,
  hostAdvantage: number,
): { home: number; away: number } {
  const averageRating = (homeRating + awayRating) / 2;
  const ratingQuality = clamp((averageRating - 55) / 33, 0, 1);
  const totalGoals = clamp(
    2.42 + ratingQuality * 0.26 + Math.min(Math.abs(neutralRatingDiff), 28) * 0.006,
    2.35,
    2.9,
  );
  const goalDiff = clamp(neutralRatingDiff * 0.045 + hostAdvantage, -1.9, 1.9);
  const home = clamp(totalGoals / 2 + goalDiff / 2, 0.18, 4.6);
  const away = clamp(totalGoals - home, 0.12, 4.6);
  return { home, away };
}

function enumerateScoreMatrix(
  homeLambda: number,
  awayLambda: number,
  maxGoals: number,
  rho: number,
): ScoreCell[] {
  const cells: ScoreCell[] = [];
  for (let home = 0; home <= maxGoals; home += 1) {
    for (let away = 0; away <= maxGoals; away += 1) {
      cells.push({
        home,
        away,
        probability:
          poissonPmf(homeLambda, home) *
          poissonPmf(awayLambda, away) *
          dixonColesAdjustment(home, away, homeLambda, awayLambda, rho),
      });
    }
  }

  const total = cells.reduce((sum, cell) => sum + cell.probability, 0);
  return total > 0
    ? cells.map((cell) => ({ ...cell, probability: cell.probability / total }))
    : cells;
}

function outcomeFromProbabilities(probabilities: Probabilities): "home" | "draw" | "away" {
  if (
    probabilities.draw >= probabilities.homeWin &&
    probabilities.draw >= probabilities.awayWin
  ) {
    return "draw";
  }
  return probabilities.homeWin >= probabilities.awayWin ? "home" : "away";
}

function scoreOutcome(home: number, away: number): "home" | "draw" | "away" {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function representativeScore(
  score: { home: number; away: number; probability: number },
  poisson: PoissonModelPrediction,
  target?: "home" | "draw" | "away",
  targetProbabilities?: Probabilities,
): number {
  const expectedHome = poisson.expectedGoals.home;
  const expectedAway = poisson.expectedGoals.away;
  const expectedTotal = poisson.expectedGoals.total;
  const total = score.home + score.away;
  const outcomeEdge = targetProbabilities
    ? Math.abs(targetProbabilities.homeWin - targetProbabilities.awayWin)
    : 0;

  const sideDistance = Math.abs(score.home - expectedHome) + Math.abs(score.away - expectedAway);
  const totalDistance = Math.abs(total - expectedTotal);
  const oneNilPenalty = total <= 1 && expectedTotal >= 2.35 ? 0.75 : 0;
  const strongFavoriteConcedesPenalty =
    target !== "draw" && outcomeEdge >= 30 && score.home > score.away && score.away > 0
      ? 0.5
      : 0;
  const narrowFavoriteCleanSheetPenalty =
    target !== "draw" && outcomeEdge < 18 && score.home > score.away && score.away === 0
      ? 0.35
      : 0;
  const highScorePenalty = Math.max(0, total - Math.ceil(expectedTotal + 1.15)) * 0.85;
  const probabilityBonus = score.probability * 0.045;

  return (
    sideDistance +
    totalDistance * 0.35 +
    oneNilPenalty +
    strongFavoriteConcedesPenalty +
    narrowFavoriteCleanSheetPenalty +
    highScorePenalty -
    probabilityBonus
  );
}

function toPercentScoreline(cell: ScoreCell) {
  return {
    home: cell.home,
    away: cell.away,
    probability: round1(cell.probability * 100),
  };
}

function normalizeOutcomeProbabilities(value: {
  homeWin: number;
  draw: number;
  awayWin: number;
}): Probabilities {
  const homeWin = clamp(Math.round(value.homeWin), 0, 100);
  const draw = clamp(Math.round(value.draw), 0, 100);
  const awayWin = 100 - homeWin - draw;

  if (awayWin < 0) {
    return normalizeOutcomeProbabilities({
      homeWin: homeWin + awayWin,
      draw,
      awayWin: 0,
    });
  }

  return { homeWin, draw, awayWin };
}

function normalizePair(overPercent: number) {
  const over2_5 = clamp(Math.round(overPercent), 0, 100);
  const under2_5 = clamp(100 - over2_5, 0, 100);
  return { over2_5, under2_5 };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
