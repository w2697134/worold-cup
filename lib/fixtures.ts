import type { Match, MatchStatus } from "./types";
import { TEAM_CODE_BY_NAME } from "./data";
import { FALLBACK_FIXTURES, FIXTURE_SNAPSHOT_SOURCE, type RawFixture } from "./fixtures-data";
import { getChinaDateKey } from "./time";

const FIXTURE_FEED_URL = "https://fixturedownload.com/feed/json/fifa-world-cup-2026";
const CACHE_MS = 15 * 60 * 1000;
const LIVE_WINDOW_MS = 150 * 60 * 1000;

export type ScheduleSource = "live" | "snapshot";

export interface SchedulePayload {
  matches: Match[];
  dates: string[];
  source: ScheduleSource;
  sourceUrl: string;
  updatedAt: string;
}

interface VenueInfo {
  city: string;
  venue: string;
  timeZone: string;
}

const VENUE_BY_LOCATION: Record<string, VenueInfo> = {
  "Mexico City Stadium": {
    city: "墨西哥城",
    venue: "墨西哥城体育场",
    timeZone: "America/Mexico_City",
  },
  "Guadalajara Stadium": {
    city: "瓜达拉哈拉",
    venue: "瓜达拉哈拉体育场",
    timeZone: "America/Mexico_City",
  },
  "Monterrey Stadium": {
    city: "蒙特雷",
    venue: "蒙特雷体育场",
    timeZone: "America/Monterrey",
  },
  "Toronto Stadium": {
    city: "多伦多",
    venue: "多伦多体育场",
    timeZone: "America/Toronto",
  },
  "BC Place Vancouver": {
    city: "温哥华",
    venue: "BC Place",
    timeZone: "America/Vancouver",
  },
  "Los Angeles Stadium": {
    city: "洛杉矶",
    venue: "洛杉矶体育场",
    timeZone: "America/Los_Angeles",
  },
  "San Francisco Bay Area Stadium": {
    city: "旧金山湾区",
    venue: "旧金山湾区体育场",
    timeZone: "America/Los_Angeles",
  },
  "Seattle Stadium": {
    city: "西雅图",
    venue: "西雅图体育场",
    timeZone: "America/Los_Angeles",
  },
  "New York/New Jersey Stadium": {
    city: "纽约/新泽西",
    venue: "纽约/新泽西体育场",
    timeZone: "America/New_York",
  },
  "Boston Stadium": {
    city: "波士顿",
    venue: "波士顿体育场",
    timeZone: "America/New_York",
  },
  "Philadelphia Stadium": {
    city: "费城",
    venue: "费城体育场",
    timeZone: "America/New_York",
  },
  "Miami Stadium": {
    city: "迈阿密",
    venue: "迈阿密体育场",
    timeZone: "America/New_York",
  },
  "Atlanta Stadium": {
    city: "亚特兰大",
    venue: "亚特兰大体育场",
    timeZone: "America/New_York",
  },
  "Dallas Stadium": {
    city: "达拉斯",
    venue: "达拉斯体育场",
    timeZone: "America/Chicago",
  },
  "Houston Stadium": {
    city: "休斯敦",
    venue: "休斯敦体育场",
    timeZone: "America/Chicago",
  },
  "Kansas City Stadium": {
    city: "堪萨斯城",
    venue: "堪萨斯城体育场",
    timeZone: "America/Chicago",
  },
};

let cachedSchedule: SchedulePayload | null = null;
let cacheExpiresAt = 0;

export async function getSchedule(): Promise<SchedulePayload> {
  const now = Date.now();
  if (cachedSchedule && now < cacheExpiresAt) return cachedSchedule;

  try {
    const response = await fetch(FIXTURE_FEED_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`fixture feed HTTP ${response.status}`);
    const fixtures = validateFixtures(await response.json());
    const schedule = buildSchedule(fixtures, "live", FIXTURE_FEED_URL);
    cachedSchedule = schedule;
    cacheExpiresAt = now + CACHE_MS;
    return schedule;
  } catch (error) {
    console.error("[fixtures] live schedule failed, using snapshot:", error);
    const schedule = buildSchedule(FALLBACK_FIXTURES, "snapshot", FIXTURE_SNAPSHOT_SOURCE);
    cachedSchedule = schedule;
    cacheExpiresAt = now + CACHE_MS;
    return schedule;
  }
}

export async function getMatches(): Promise<Match[]> {
  return (await getSchedule()).matches;
}

export function mapFixturesToMatches(fixtures: RawFixture[]): Match[] {
  return fixtures
    .map(mapFixtureToMatch)
    .sort((a, b) => toMatchTime(a) - toMatchTime(b));
}

function buildSchedule(
  fixtures: RawFixture[],
  source: ScheduleSource,
  sourceUrl: string,
): SchedulePayload {
  const matches = mapFixturesToMatches(fixtures);
  const dates = Array.from(new Set(matches.map(getChinaDateKey))).sort();
  return {
    matches,
    dates,
    source,
    sourceUrl,
    updatedAt: new Date().toISOString(),
  };
}

function mapFixtureToMatch(fixture: RawFixture): Match {
  const utcDate = normalizeUtc(fixture.DateUtc);
  const venue = VENUE_BY_LOCATION[fixture.Location] ?? {
    city: fixture.Location,
    venue: fixture.Location,
    timeZone: "America/New_York",
  };
  const venueTime = getParts(new Date(utcDate), venue.timeZone);
  const home = teamCodeFromFixtureName(fixture.HomeTeam);
  const away = teamCodeFromFixtureName(fixture.AwayTeam);
  const hasResult =
    typeof fixture.HomeTeamScore === "number" && typeof fixture.AwayTeamScore === "number";

  return {
    id: `match-${String(fixture.MatchNumber).padStart(3, "0")}`,
    date: `${venueTime.year}-${pad(venueTime.month)}-${pad(venueTime.day)}`,
    kickoff: `${pad(venueTime.hour)}:${pad(venueTime.minute)}`,
    utcDate,
    stage: stageLabel(fixture),
    venue: venue.venue,
    city: venue.city,
    home,
    away,
    status: matchStatus(utcDate, hasResult),
    result: hasResult
      ? { home: fixture.HomeTeamScore as number, away: fixture.AwayTeamScore as number }
      : undefined,
  };
}

function teamCodeFromFixtureName(name: string): string {
  const direct = TEAM_CODE_BY_NAME[name];
  if (direct) return direct;
  if (name === "To be announced") return "tbd";
  if (/^[123][A-L]+$/i.test(name)) return `slot-${name.toLowerCase()}`;
  return `slot-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function stageLabel(fixture: RawFixture): string {
  if (fixture.Group?.startsWith("Group ")) {
    return `小组赛 · ${fixture.Group.replace("Group ", "")}组`;
  }

  if (fixture.RoundNumber === 4) return "32强赛";
  if (fixture.RoundNumber === 5) return "16强赛";
  if (fixture.RoundNumber === 6) return "四分之一决赛";
  if (fixture.RoundNumber === 7) return "半决赛";
  if (fixture.MatchNumber === 103) return "三四名决赛";
  if (fixture.MatchNumber === 104) return "决赛";
  return "淘汰赛";
}

function matchStatus(utcDate: string, hasResult: boolean): MatchStatus {
  if (hasResult) return "finished";

  const kickoff = new Date(utcDate).getTime();
  const now = Date.now();
  if (now >= kickoff && now <= kickoff + LIVE_WINDOW_MS) return "live";
  if (now > kickoff + LIVE_WINDOW_MS) return "finished";
  return "upcoming";
}

function normalizeUtc(value: string): string {
  return value.includes("T") ? value : value.replace(" ", "T");
}

function toMatchTime(match: Match): number {
  if (match.utcDate) return new Date(match.utcDate).getTime();
  return new Date(`${match.date}T${match.kickoff}:00`).getTime();
}

function validateFixtures(value: unknown): RawFixture[] {
  if (!Array.isArray(value)) throw new Error("fixture feed is not an array");
  if (value.length < 72) throw new Error("fixture feed is incomplete");
  return value as RawFixture[];
}

function getParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((result, part) => {
      if (part.type !== "literal") result[part.type] = Number(part.value);
      return result;
    }, {});

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
