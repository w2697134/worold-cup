import type { Match } from "./types";

const CHINA_TIME_ZONE = "Asia/Shanghai";

const VENUE_TIME_ZONE_BY_CITY: Record<string, string> = {
  墨西哥城: "America/Mexico_City",
  瓜达拉哈拉: "America/Mexico_City",
  蒙特雷: "America/Monterrey",
  多伦多: "America/Toronto",
  洛杉矶: "America/Los_Angeles",
  温哥华: "America/Vancouver",
  西雅图: "America/Los_Angeles",
  亚特兰大: "America/New_York",
  达拉斯: "America/Chicago",
  波士顿: "America/New_York",
  费城: "America/New_York",
  迈阿密: "America/New_York",
  "纽约/新泽西": "America/New_York",
  休斯敦: "America/Chicago",
  堪萨斯城: "America/Chicago",
  旧金山湾区: "America/Los_Angeles",
};

export function getChinaDateKey(match: Match): string {
  const parts = getParts(toUtcFromVenueTime(match), CHINA_TIME_ZONE);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatChinaKickoff(match: Match, options: { includeDate?: boolean } = {}): string {
  const parts = getParts(toUtcFromVenueTime(match), CHINA_TIME_ZONE);
  const time = `${pad(parts.hour)}:${pad(parts.minute)}`;

  if (options.includeDate === false) return time;
  return `${parts.month}月${parts.day}日 ${time}`;
}

export function toUtcFromVenueTime(match: Match): Date {
  if (match.utcDate) return new Date(match.utcDate);

  const timeZone = VENUE_TIME_ZONE_BY_CITY[match.city] ?? "America/New_York";
  return zonedTimeToUtc(match.date, match.kickoff, timeZone);
}

function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const zoned = getParts(utcGuess, timeZone);
  const zonedAsUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
  );
  const offset = zonedAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset);
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
