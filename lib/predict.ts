import type { Prediction, PredictionStrategyConfig } from "./types";
import { buildBaselinePrediction } from "./prediction-baseline";
import type { Match } from "./types";

export function predictMatch(
  match: Match,
  knowledgeContext?: string,
  strategyConfig?: PredictionStrategyConfig,
): Prediction {
  return buildBaselinePrediction(match, knowledgeContext, strategyConfig);
}
