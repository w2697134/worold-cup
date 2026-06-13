// ============================================================================
// API CONTRACT TYPES
// ----------------------------------------------------------------------------
// These shapes mirror the JSON contract used by the API routes. The prediction
// engine can be replaced later without changing the frontend surface.
// ============================================================================

/** Team tier used for badges and future model features. */
export type TeamTier =
  | "favorite"
  | "contender"
  | "host"
  | "darkhorse"
  | "newcomer";

export interface Team {
  /** Flag CDN code, also used as the team key. */
  code: string;
  name: string;
  nameEn: string;
  group: string;
  tier: TeamTier;
}

export type MatchStatus = "upcoming" | "live" | "finished";

export interface Match {
  id: string;
  date: string; // YYYY-MM-DD, local venue date
  kickoff: string; // HH:mm, local venue time
  utcDate?: string; // ISO UTC kickoff when the schedule source provides it
  stage: string;
  venue: string;
  city: string;
  home: string;
  away: string;
  status: MatchStatus;
  result?: { home: number; away: number };
}

export type FactorWeight = "high" | "mid" | "low";
export type Confidence = "high" | "mid" | "low";

export interface KeyFactor {
  label: string;
  weight: FactorWeight;
}

export interface KeyPlayer {
  team: string;
  name: string;
  note: string;
}

export interface PoissonScoreline {
  home: number;
  away: number;
  probability: number;
}

export interface PoissonModelPrediction {
  expectedGoals: {
    home: number;
    away: number;
    total: number;
    hostAdvantage: number;
  };
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  totals: {
    over2_5: number;
    under2_5: number;
  };
  topScores: PoissonScoreline[];
  scoreMatrix: PoissonScoreline[];
}

export type ValueOutcome = "home" | "draw" | "away";

export interface ValuePick {
  outcome: ValueOutcome;
  edge: number;
  ev: number;
  kellyFraction: number;
}

export interface ValueAssessment {
  hasValue: boolean;
  picks: ValuePick[];
  note: string;
}

export interface Prediction {
  matchId: string;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  predictedScore: { home: number; away: number };
  confidence: Confidence;
  keyFactors: KeyFactor[];
  commentary: string;
  keyPlayers: { home: KeyPlayer; away: KeyPlayer };
  source: "stub" | "skill";
  generatedAt: string;
  usedIntelligence?: UsedIntelligence;
  poisson?: PoissonModelPrediction;
  value?: ValueAssessment;
}

export type PredictionOutcome = "homeWin" | "draw" | "awayWin";

export interface ReviewMatchResult {
  matchId: string;
  predicted: {
    probabilities: Prediction["probabilities"];
    score: Prediction["predictedScore"];
    expectedGoals?: PoissonModelPrediction["expectedGoals"];
    outcome: PredictionOutcome;
  };
  actual: {
    score: NonNullable<Match["result"]>;
    outcome: PredictionOutcome;
  };
  outcomeHit: boolean;
  scoreHit: boolean;
  brier: number;
}

export interface ReviewSummary {
  count: number;
  outcomeHitRate: number | null;
  scoreHitRate: number | null;
  avgBrier: number | null;
}

export interface StrategyBacktestResult {
  strategy: string;
  outcome?: "homeWin" | "draw" | "awayWin";
  hitRate: number | null;
  sampleSize: number;
  hits: number;
  note: string;
}

export type PredictionStrategyId = "ranking" | "market" | "h2h" | "form";

export interface PredictionStrategySetting {
  id: PredictionStrategyId;
  name: string;
  enabled: boolean;
  priority: number;
  note: string;
}

export interface PredictionStrategyConfig {
  strategies: PredictionStrategySetting[];
}

export interface UsedIntelligence {
  labels: string[];
  notes: string[];
  marketProbabilities?: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  backtest?: StrategyBacktestResult;
  caveat?: string;
}

export type KnowledgeCategory =
  | "team_news"
  | "injury"
  | "lineup"
  | "tactics"
  | "weather"
  | "travel"
  | "form"
  | "history"
  | "market"
  | "other";

export type KnowledgeReliability = "high" | "mid" | "low";

export interface KnowledgeItem {
  id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  scope: string;
  matchId?: string;
  teamCode?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  reliability: KnowledgeReliability;
  createdAt: string;
  updatedAt: string;
}

export interface CompiledKnowledge {
  summary: string;
  facts: string[];
  risks: string[];
  prompt: string;
  sourceCount: number;
  updatedAt: string;
  generatedBy: "deepseek" | "local";
}
