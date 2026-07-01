import { getTeamName, getTeamNameEn, isMatchupKnown } from "./data";
import type { KnowledgeItem, Match } from "./types";

const CURRENT_WORLD_CUP_RE = /(2026|world cup|fifa|世界杯|世足|世预赛|预选赛)/i;

const QUALIFICATION_CONFLICT_PATTERNS = [
  /尚未.{0,24}(确认|获得|取得).{0,24}(参赛|正赛)?资格/,
  /未.{0,24}(获得|取得|确认).{0,24}(2026|世界杯|正赛|参赛).{0,24}资格/,
  /(2026|世界杯|正赛|参赛).{0,24}(资格).{0,40}(尚未|未获得|未取得|未确认|无缘|出局|淘汰)/,
  /(资格赛|预选赛|世预赛).{0,80}(出局|淘汰|无缘|未获得|未取得)/,
  /(取消|剥夺).{0,12}(参赛)?资格/,
  /被.{0,12}(取消|剥夺).{0,12}(参赛)?资格/,
  /not\s+(yet\s+)?(qualified|confirmed)/i,
  /(failed|fails)\s+to\s+qualify/i,
  /qualif\w*.{0,80}(eliminated|knocked out|failed|not qualified|not confirmed|disqualified)/i,
  /(disqualified|ineligible).{0,80}(2026|world cup|qualification|tournament)/i,
  /(2026|world cup|qualification|tournament).{0,80}(disqualified|ineligible)/i,
];

const HISTORICAL_RETURN_PATTERNS = [
  /not qualified since/i,
  /had not qualified since/i,
  /first appearance since/i,
  /首次.{0,16}晋级/,
  /时隔.{0,16}(重返|回归|晋级)/,
];

const HISTORICAL_RETURN_CONFIRMATION = /(qualified|return|returned|appearance|晋级|获得资格|重返|回归)/i;

export function filterKnowledgeItemsForMatch<T extends KnowledgeItem>(
  items: T[],
  match: Match | null | undefined,
): T[] {
  if (!match || !isMatchupKnown(match)) return items;
  return items.filter((item) => !isContradictoryQualificationItem(item, match));
}

export function countBlockedKnowledgeItems(
  items: KnowledgeItem[],
  match: Match | null | undefined,
): number {
  if (!match || !isMatchupKnown(match)) return 0;
  return items.filter((item) => isContradictoryQualificationItem(item, match)).length;
}

export function isContradictoryQualificationItem(
  item: KnowledgeItem,
  match: Match,
): boolean {
  if (!isMatchupKnown(match)) return false;

  const text = normalizeText(
    [item.title, item.content, item.scope, item.sourceLabel, item.sourceUrl].filter(Boolean).join(" "),
  );
  if (!text || !CURRENT_WORLD_CUP_RE.test(text)) return false;
  if (!mentionsMatchTeam(text, match)) return false;
  if (!QUALIFICATION_CONFLICT_PATTERNS.some((pattern) => pattern.test(text))) return false;

  // Do not block legitimate historical phrasing such as
  // "first appearance since 1974" when it also confirms qualification.
  if (
    HISTORICAL_RETURN_PATTERNS.some((pattern) => pattern.test(text)) &&
    HISTORICAL_RETURN_CONFIRMATION.test(text)
  ) {
    return false;
  }

  return true;
}

function mentionsMatchTeam(text: string, match: Match): boolean {
  const names = [
    match.home,
    match.away,
    getTeamName(match.home),
    getTeamName(match.away),
    getTeamNameEn(match.home),
    getTeamNameEn(match.away),
  ]
    .map(normalizeText)
    .filter(Boolean);

  return names.some((name) => text.includes(name));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
