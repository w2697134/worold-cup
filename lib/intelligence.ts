import { getTeamName, getTeamNameEn } from "./data";
import type { Match, Prediction } from "./types";

type Probabilities = Prediction["probabilities"];

export interface DecimalOdds {
  home: number;
  draw: number;
  away: number;
}

export interface RankingIntel {
  homeRank: number;
  awayRank: number;
  ratingEdge: number;
}

export interface ExtractedIntelligence {
  text: string;
  labels: string[];
  notes: string[];
  odds?: DecimalOdds;
  marketProbabilities?: Probabilities;
  ranking?: RankingIntel;
  weather?: string;
  hasMarketTrend: boolean;
  hasInjury: boolean;
  hasLineup: boolean;
  hasForm: boolean;
  hasHistory: boolean;
}

export function extractMatchIntelligence(
  knowledgeContext?: string,
  match?: Match,
): ExtractedIntelligence {
  const text = cleanText(knowledgeContext ?? "");
  const odds = extractDecimalOdds(text);
  const marketProbabilities = odds ? oddsToProbabilities(odds) : undefined;
  const ranking = extractRanking(text, match);
  const weather = extractWeather(text);
  const hasMarketTrend = /盘口|赔率|欧指|亚指|让球|主胜|客胜|升水|降水|下调|上调|市场|水位/.test(
    text,
  );
  const hasInjury = /伤停|受伤|缺阵|伤缺|无法出战|停赛|injur|suspend|out\b/i.test(text);
  const hasLineup = /首发|阵容|名单|替补|轮换|lineup|squad|starting/i.test(text);
  const hasForm = /近期|近\d+场|战绩|状态|连胜|不胜|进球|失球|form/i.test(text);
  const hasHistory = /交锋|历史|往绩|h2h|head[- ]to[- ]head/i.test(text);

  const labels: string[] = [];
  if (marketProbabilities || hasMarketTrend) labels.push("盘口");
  if (ranking) labels.push("排名");
  if (weather) labels.push("天气");
  if (hasInjury) labels.push("伤停");
  if (hasLineup) labels.push("阵容");
  if (hasForm) labels.push("状态");
  if (hasHistory) labels.push("交锋");

  const notes: string[] = [];
  if (marketProbabilities) {
    notes.push(
      `盘口折算：主胜 ${marketProbabilities.homeWin}% / 平 ${marketProbabilities.draw}% / 客胜 ${marketProbabilities.awayWin}%`,
    );
  }
  if (ranking && match) {
    notes.push(
      `排名参考：${getTeamName(match.home)} ${ranking.homeRank}，${getTeamName(match.away)} ${ranking.awayRank}`,
    );
  }
  if (weather) notes.push(`天气：${weather}`);
  if (hasInjury) notes.push("包含伤停信息");
  if (hasLineup) notes.push("包含阵容信息");
  if (hasForm) notes.push("包含近期状态");
  if (hasHistory) notes.push("包含历史交锋");

  return {
    text,
    labels,
    notes,
    odds,
    marketProbabilities,
    ranking,
    weather,
    hasMarketTrend,
    hasInjury,
    hasLineup,
    hasForm,
    hasHistory,
  };
}

export function oddsToProbabilities(odds: DecimalOdds): Probabilities {
  const rawHome = 1 / odds.home;
  const rawDraw = 1 / odds.draw;
  const rawAway = 1 / odds.away;
  const sum = rawHome + rawDraw + rawAway;
  const homeWin = Math.round((rawHome / sum) * 100);
  const draw = Math.round((rawDraw / sum) * 100);
  return normalizeProbabilities({
    homeWin,
    draw,
    awayWin: 100 - homeWin - draw,
  });
}

export function rankRatingEdge(ranking?: RankingIntel): number {
  return ranking?.ratingEdge ?? 0;
}

function extractDecimalOdds(text: string): DecimalOdds | undefined {
  if (!text) return undefined;

  const strict = /胜平负[^\n。；]{0,100}?(?:主胜|胜)\s*[:：]?\s*(\d+(?:\.\d+)?)[^\d]{1,20}平(?:局)?\s*[:：]?\s*(\d+(?:\.\d+)?)[^\d]{1,20}(?:主负|客胜|负)\s*[:：]?\s*(\d+(?:\.\d+)?)/.exec(
    text,
  );
  const strictOdds = strict ? buildOdds(strict[1], strict[2], strict[3]) : undefined;
  if (strictOdds) return strictOdds;

  const generic =
    /(?:主胜|胜)\s*[:：]?\s*(\d+(?:\.\d+)?)[^\d]{1,20}平(?:局)?\s*[:：]?\s*(\d+(?:\.\d+)?)[^\d]{1,20}(?:主负|客胜|负)\s*[:：]?\s*(\d+(?:\.\d+)?)/g;

  for (const match of text.matchAll(generic)) {
    const context = text.slice(Math.max(0, match.index - 30), match.index + match[0].length);
    if (/让球|让胜|让平|让负/.test(context)) continue;
    const odds = buildOdds(match[1], match[2], match[3]);
    if (odds) return odds;
  }

  const english =
    /(?:odds|decimal odds|1x2|欧赔|胜平负)[^\n。；]{0,80}?(\d+(?:\.\d+)?)[^\d\n]{1,16}(\d+(?:\.\d+)?)[^\d\n]{1,16}(\d+(?:\.\d+)?)/i.exec(
      text,
    );
  const englishOdds = english ? buildOdds(english[1], english[2], english[3]) : undefined;
  if (englishOdds) return englishOdds;

  const jsonLike =
    /["']?home["']?\s*:\s*(\d+(?:\.\d+)?)[\s\S]{0,80}?["']?draw["']?\s*:\s*(\d+(?:\.\d+)?)[\s\S]{0,80}?["']?away["']?\s*:\s*(\d+(?:\.\d+)?)/i.exec(
      text,
    );
  const jsonOdds = jsonLike ? buildOdds(jsonLike[1], jsonLike[2], jsonLike[3]) : undefined;
  if (jsonOdds) return jsonOdds;

  return undefined;
}

function buildOdds(home: string, draw: string, away: string): DecimalOdds | undefined {
  const odds = {
    home: Number(home),
    draw: Number(draw),
    away: Number(away),
  };
  if ([odds.home, odds.draw, odds.away].some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  if ([odds.home, odds.draw, odds.away].some((value) => value <= 1.01 || value > 50)) {
    return undefined;
  }
  return odds;
}

function extractRanking(text: string, match?: Match): RankingIntel | undefined {
  if (!text) return undefined;

  let homeRank: number | undefined;
  let awayRank: number | undefined;

  if (match) {
    const homePattern = teamNamePattern(match.home);
    const awayPattern = teamNamePattern(match.away);
    const direct = new RegExp(
      `(?:${homePattern})[^\\n。；]{0,24}\\[(\\d{1,3})\\][\\s\\S]{0,80}(?:${awayPattern})[^\\n。；]{0,24}\\[(\\d{1,3})\\]`,
    ).exec(text);

    if (direct) {
      homeRank = Number(direct[1]);
      awayRank = Number(direct[2]);
    }
  }

  if (!homeRank || !awayRank) {
    const rankingLine = /排名[^\n。；]{0,140}/.exec(text)?.[0] ?? "";
    const nums = Array.from(rankingLine.matchAll(/\[(\d{1,3})\]/g)).map((item) =>
      Number(item[1]),
    );
    if (nums.length >= 2) {
      homeRank = nums[0];
      awayRank = nums[1];
    }
  }

  if (!homeRank || !awayRank || homeRank < 1 || awayRank < 1) return undefined;

  return {
    homeRank,
    awayRank,
    ratingEdge: clamp((awayRank - homeRank) / 4, -9, 9),
  };
}

function extractWeather(text: string): string | undefined {
  const match = /天气\s*[:：]?\s*([^\n。；]{2,42})/.exec(text);
  return match ? match[1].trim() : undefined;
}

function teamNamePattern(code: string): string {
  return [getTeamName(code), getTeamNameEn(code)]
    .filter(Boolean)
    .map(escapeRegExp)
    .join("|");
}

function normalizeProbabilities(value: Probabilities): Probabilities {
  const homeWin = clamp(Math.round(value.homeWin), 0, 100);
  const draw = clamp(Math.round(value.draw), 0, 100);
  const awayWin = 100 - homeWin - draw;

  if (awayWin < 0) {
    return normalizeProbabilities({
      homeWin: homeWin + awayWin,
      draw,
      awayWin: 0,
    });
  }

  return { homeWin, draw, awayWin };
}

function cleanText(value: string): string {
  return value.replace(/\0/g, "").trim().slice(0, 10000);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
