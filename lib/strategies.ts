import type {
  PredictionStrategyConfig,
  PredictionStrategyId,
  PredictionStrategySetting,
} from "./types";

export const DEFAULT_PREDICTION_STRATEGIES: PredictionStrategySetting[] = [
  {
    id: "ranking",
    name: "排名强度",
    enabled: true,
    priority: 2,
    note: "看双方基础强弱和排名差。",
  },
  {
    id: "market",
    name: "盘口倾向",
    enabled: true,
    priority: 3,
    note: "有赔率时参考市场方向。",
  },
  {
    id: "h2h",
    name: "交锋延续",
    enabled: true,
    priority: 4,
    note: "有交锋比分时做相似回测。",
  },
  {
    id: "form",
    name: "近期状态",
    enabled: true,
    priority: 1,
    note: "有近期比分时看走势。",
  },
];

export function normalizeStrategyConfig(
  config?: PredictionStrategyConfig | null,
): PredictionStrategyConfig {
  const incoming = new Map(
    (config?.strategies ?? []).map((strategy) => [strategy.id, strategy]),
  );

  return {
    strategies: DEFAULT_PREDICTION_STRATEGIES.map((fallback) => {
      const strategy = incoming.get(fallback.id);
      return {
        id: fallback.id,
        name: compactStrategyText(strategy?.name, fallback.name, 16),
        enabled: typeof strategy?.enabled === "boolean" ? strategy.enabled : fallback.enabled,
        priority: clampPriority(strategy?.priority ?? fallback.priority),
        note: compactStrategyText(strategy?.note, fallback.note, 36),
      };
    }),
  };
}

export function strategyMap(config?: PredictionStrategyConfig | null) {
  return new Map(normalizeStrategyConfig(config).strategies.map((strategy) => [strategy.id, strategy]));
}

export function strategyIsEnabled(
  id: PredictionStrategyId,
  config?: PredictionStrategyConfig | null,
) {
  return strategyMap(config).get(id)?.enabled ?? true;
}

function compactStrategyText(value: unknown, fallback: string, limit: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > limit ? text.slice(0, limit) : text;
}

function clampPriority(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(4, Math.max(1, parsed));
}
