import type { ExtractedIntelligence } from "./intelligence";
import type { Prediction, ValueAssessment, ValueOutcome } from "./types";

type Probabilities = Prediction["probabilities"];

const VALUE_THRESHOLD = 0.04;
const MAX_QUARTER_KELLY = 0.02;

export function assessValue(
  probabilities: Probabilities,
  intelligence: ExtractedIntelligence,
): ValueAssessment | undefined {
  if (!intelligence.odds || !intelligence.marketProbabilities) return undefined;

  const picks: ValueAssessment["picks"] = (["home", "draw", "away"] as const)
    .map((outcome) => {
      const modelProbability = probabilityForOutcome(probabilities, outcome);
      const marketProbability = probabilityForOutcome(intelligence.marketProbabilities!, outcome);
      const odds = oddsForOutcome(intelligence.odds!, outcome);
      const edge = modelProbability - marketProbability;
      const ev = modelProbability * (odds - 1) - (1 - modelProbability);
      const fullKelly = ev / (odds - 1);
      const kellyFraction = clamp(fullKelly * 0.25, 0, MAX_QUARTER_KELLY);

      return {
        outcome,
        edge: round4(edge),
        ev: round4(ev),
        kellyFraction: round4(kellyFraction),
      };
    })
    .filter((pick) => pick.edge > VALUE_THRESHOLD && pick.ev > 0)
    .sort((a, b) => b.ev - a.ev || b.edge - a.edge);

  return {
    hasValue: picks.length > 0,
    picks,
    note: picks.length
      ? "仅做模型与盘口差异记录，不构成投注建议。"
      : "未发现超过 4% edge 且 EV 为正的选择，不构成投注建议。",
  };
}

function probabilityForOutcome(probabilities: Probabilities, outcome: ValueOutcome): number {
  if (outcome === "home") return probabilities.homeWin / 100;
  if (outcome === "draw") return probabilities.draw / 100;
  return probabilities.awayWin / 100;
}

function oddsForOutcome(
  odds: NonNullable<ExtractedIntelligence["odds"]>,
  outcome: ValueOutcome,
): number {
  if (outcome === "home") return odds.home;
  if (outcome === "draw") return odds.draw;
  return odds.away;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
