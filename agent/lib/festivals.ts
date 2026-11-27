/**
 * Festivals, holidays and personal days, so Juno can celebrate with you.
 *
 * Fixed-date days are computed. Days that follow lunar calendars come from a
 * table for 2026–2028; add later years to MOVABLE as needed. Lunar dates can
 * differ by a day by region or moon sighting.
 */

export type Accessory =
  | "party-hat" | "santa-hat" | "witch-hat" | "heart" | "leaf-crown" | "diya"
  | "lantern" | "crescent-star" | "shamrock" | "flower-crown" | "sparkles" | "bunny-ears";

export type Effect = "confetti" | "fireworks" | "hearts" | "snow" | "leaves" | "sparkles";

export type Festival = {
  id: string;
  name: string;
  greeting: string;
  emoji: string;
  accessory: Accessory;
  effect: Effect;
};

type Rule = Festival & { on: (year: number) => string[] };

const pad = (n: number) => String(n).padStart(2, "0");
const md = (m: number, d: number) => `${pad(m)}-${pad(d)}`;

/** The n-th weekday (0 = Sunday) of a month, as MM-DD. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return md(month, day);
}

/** Western Easter Sunday (anonymous Gregorian algorithm). */
function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return md(month, day);
}

/** Lunar-calendar days, by year. */
const MOVABLE: Record<string, Record<number, string>> = {
  "lunar-new-year": { 2026: "02-17", 2027: "02-06", 2028: "01-26" },
  holi: { 2026: "03-04", 2027: "03-22", 2028: "03-11" },
  "eid-al-fitr": { 2026: "03-20", 2027: "03-10", 2028: "02-27" },
  "eid-al-adha": { 2026: "05-27", 2027: "05-17", 2028: "05-05" },
  diwali: { 2026: "11-08", 2027: "10-29", 2028: "10-17" },
  hanukkah: { 2026: "12-05", 2027: "12-25", 2028: "12-13" },
};
const movable = (id: string) => (year: number) => (MOVABLE[id]?.[year] ? [MOVABLE[id][year]] : []);
const fixed = (m: number, d: number) => () => [md(m, d)];

const RULES: Rule[] = [
  { id: "new-year", name: "New Year's Day", greeting: "Happy New Year", emoji: "🎉", accessory: "party-hat", effect: "fireworks", on: fixed(1, 1) },
  { id: "lunar-new-year", name: "Lunar New Year", greeting: "Happy Lunar New Year", emoji: "🏮", accessory: "lantern", effect: "fireworks", on: movable("lunar-new-year") },
  { id: "valentines", name: "Valentine's Day", greeting: "Happy Valentine's Day", emoji: "💖", accessory: "heart", effect: "hearts", on: fixed(2, 14) },
  { id: "holi", name: "Holi", greeting: "Happy Holi", emoji: "🎨", accessory: "flower-crown", effect: "confetti", on: movable("holi") },
  { id: "womens-day", name: "International Women's Day", greeting: "Happy Women's Day", emoji: "🌷", accessory: "flower-crown", effect: "sparkles", on: fixed(3, 8) },
  { id: "pi-day", name: "Pi Day", greeting: "Happy Pi Day", emoji: "🥧", accessory: "sparkles", effect: "sparkles", on: fixed(3, 14) },
  { id: "st-patricks", name: "St. Patrick's Day", greeting: "Happy St. Patrick's Day", emoji: "☘️", accessory: "shamrock", effect: "confetti", on: fixed(3, 17) },
  { id: "eid-al-fitr", name: "Eid al-Fitr", greeting: "Eid Mubarak", emoji: "🌙", accessory: "crescent-star", effect: "sparkles", on: movable("eid-al-fitr") },
  { id: "easter", name: "Easter", greeting: "Happy Easter", emoji: "🐣", accessory: "bunny-ears", effect: "confetti", on: (y) => [easter(y)] },
  { id: "earth-day", name: "Earth Day", greeting: "Happy Earth Day", emoji: "🌍", accessory: "leaf-crown", effect: "leaves", on: fixed(4, 22) },
  { id: "mothers-day", name: "Mother's Day", greeting: "Happy Mother's Day", emoji: "💐", accessory: "flower-crown", effect: "hearts", on: (y) => [nthWeekday(y, 5, 0, 2)] },
  { id: "eid-al-adha", name: "Eid al-Adha", greeting: "Eid Mubarak", emoji: "🌙", accessory: "crescent-star", effect: "sparkles", on: movable("eid-al-adha") },
  { id: "fathers-day", name: "Father's Day", greeting: "Happy Father's Day", emoji: "👔", accessory: "sparkles", effect: "confetti", on: (y) => [nthWeekday(y, 6, 0, 3)] },
  { id: "us-independence", name: "Independence Day (US)", greeting: "Happy Fourth of July", emoji: "🎆", accessory: "sparkles", effect: "fireworks", on: fixed(7, 4) },
  { id: "india-independence", name: "Independence Day (India)", greeting: "Happy Independence Day", emoji: "🇮🇳", accessory: "sparkles", effect: "fireworks", on: fixed(8, 15) },
  { id: "halloween", name: "Halloween", greeting: "Happy Halloween", emoji: "🎃", accessory: "witch-hat", effect: "sparkles", on: fixed(10, 31) },
  { id: "diwali", name: "Diwali", greeting: "Happy Diwali", emoji: "🪔", accessory: "diya", effect: "fireworks", on: movable("diwali") },
  { id: "thanksgiving", name: "Thanksgiving", greeting: "Happy Thanksgiving", emoji: "🦃", accessory: "leaf-crown", effect: "leaves", on: (y) => [nthWeekday(y, 11, 4, 4)] },
  { id: "hanukkah", name: "Hanukkah", greeting: "Happy Hanukkah", emoji: "🕎", accessory: "sparkles", effect: "sparkles", on: movable("hanukkah") },
  { id: "christmas-eve", name: "Christmas Eve", greeting: "Merry Christmas Eve", emoji: "🎄", accessory: "santa-hat", effect: "snow", on: fixed(12, 24) },
  { id: "christmas", name: "Christmas", greeting: "Merry Christmas", emoji: "🎄", accessory: "santa-hat", effect: "snow", on: fixed(12, 25) },
  { id: "new-years-eve", name: "New Year's Eve", greeting: "Happy New Year's Eve", emoji: "🥂", accessory: "party-hat", effect: "fireworks", on: fixed(12, 31) },
];

export type Today = {
  date: string; // YYYY-MM-DD in the person's time zone
  weekday: string;
  partOfDay: "morning" | "afternoon" | "evening" | "night";
  season: "winter" | "spring" | "summer" | "autumn";
  festival: Festival | null;
};

/** What today is for this person: their local date, part of day, season and any celebration. */
export function todayFor(timeZone: string, birthday?: string, joinedAt?: string, now = new Date()): Today {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "long",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const monthDay = `${parts.month}-${parts.day}`;
  const hour = Number(parts.hour) % 24;
  const month = Number(parts.month);

  let festival: Festival | null = null;
  if (birthday && birthday === monthDay) {
    festival = { id: "birthday", name: "your birthday", greeting: "Happy birthday", emoji: "🎂", accessory: "party-hat", effect: "confetti" };
  } else {
    const rule = RULES.find((r) => r.on(year).includes(monthDay));
    if (rule) {
      const { on: _on, ...f } = rule;
      festival = f;
    } else if (joinedAt) {
      const joined = joinedAt.slice(5, 10);
      const joinedYear = Number(joinedAt.slice(0, 4));
      if (joined === monthDay && year > joinedYear) {
        const years = year - joinedYear;
        festival = {
          id: "anniversary", name: `${years} year${years === 1 ? "" : "s"} together`,
          greeting: "Happy anniversary", emoji: "✨", accessory: "sparkles", effect: "sparkles",
        };
      }
    }
  }

  return {
    date: `${parts.year}-${monthDay}`,
    weekday: parts.weekday,
    partOfDay: hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night",
    season: month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn",
    festival,
  };
}
