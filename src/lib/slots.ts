import { BRAND } from "./brand";
import type { Range } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export const OPEN = 8 * 60;
export const CLOSE = 17 * 60;
export const STEP = 30;
const LUNCH_START = 12 * 60;
const LUNCH_END = 13 * 60;

export interface Slot {
  id: string;
  date: string;
  time: string;
}

// ---------- date helpers (clinic-local, string based) ----------

export function localNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAND.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

export const today = (): string => localNow().date;

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export const weekdayOf = (date: string): number =>
  new Date(`${date}T00:00:00Z`).getUTCDay();

export const isBusinessDay = (date: string): boolean => {
  const w = weekdayOf(date);
  return w > 0 && w < 6;
};

export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (m: number): string =>
  `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function nextBusinessDays(count: number, from = today()): string[] {
  const out: string[] = [];
  let d = from;
  while (out.length < count) {
    d = addDays(d, 1);
    if (isBusinessDay(d)) out.push(d);
  }
  return out;
}

// ---------- slot ids ----------

export const slotId = (date: string, time: string): string =>
  `${date.replace(/-/g, "")}T${time.replace(":", "")}`;

export function parseSlotId(id: string): { date: string; time: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(id);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

// ---------- deterministic fake availability ----------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const isBooked = (date: string, time: string): boolean =>
  hash(`${date}|${time}|willowbrook`) % 100 < 52;

export function slotsOn(date: string): Slot[] {
  if (!isBusinessDay(date)) return [];
  const out: Slot[] = [];
  for (let m = OPEN; m < CLOSE; m += STEP) {
    if (m >= LUNCH_START && m < LUNCH_END) continue;
    const time = fromMin(m);
    if (!isBooked(date, time)) out.push({ id: slotId(date, time), date, time });
  }
  return out;
}

export function horizonDates(days = 21): string[] {
  const t = today();
  return Array.from({ length: days }, (_, i) => addDays(t, i + 1));
}

export function isSlotAvailable(id: string): boolean {
  const p = parseSlotId(id);
  if (!p) return false;
  return slotsOn(p.date).some((s) => s.id === id) && p.date > today();
}

function spread<T>(arr: T[], k: number): T[] {
  if (arr.length <= k) return arr;
  if (k === 1) return [arr[0]];
  return Array.from({ length: k }, (_, i) =>
    arr[Math.round((i * (arr.length - 1)) / (k - 1))],
  );
}

const byId = (a: Slot, b: Slot) => a.id.localeCompare(b.id);

/** Slots that fall inside the patient's ranges, spread across days/times. */
export function findSlots(
  ranges: Range[],
  opts: { exclude?: string[]; max?: number } = {},
): Slot[] {
  const max = opts.max ?? 3;
  const ex = new Set(opts.exclude ?? []);
  const horizon = new Set(horizonDates());
  const pool = new Map<string, Slot>();
  for (const r of ranges) {
    if (!horizon.has(r.date)) continue;
    const s = toMin(r.start);
    const e = toMin(r.end);
    for (const sl of slotsOn(r.date)) {
      const t = toMin(sl.time);
      if (t >= s && t < e && !ex.has(sl.id)) pool.set(sl.id, sl);
    }
  }
  const all = [...pool.values()].sort(byId);
  if (all.length <= max) return all;

  const dates = [...new Set(all.map((s) => s.date))];
  if (dates.length >= max) {
    const chosen = spread(dates, max);
    return chosen.map((d) => all.find((s) => s.date === d) as Slot);
  }
  const base = Math.floor(max / dates.length);
  const extra = max % dates.length;
  const out: Slot[] = [];
  dates.forEach((d, i) => {
    const day = all.filter((s) => s.date === d);
    out.push(...spread(day, base + (i < extra ? 1 : 0)));
  });
  return out.sort(byId);
}

/** Soonest openings on distinct days, mixing morning and afternoon. */
export function suggestSoonest(opts: {
  exclude?: string[];
  skipDates?: string[];
  max?: number;
}): Slot[] {
  const max = opts.max ?? 3;
  const ex = new Set(opts.exclude ?? []);
  const skip = new Set(opts.skipDates ?? []);
  const out: Slot[] = [];
  for (const d of horizonDates()) {
    if (out.length >= max) break;
    if (skip.has(d)) continue;
    const day = slotsOn(d).filter((s) => !ex.has(s.id));
    if (!day.length) continue;
    const wantAfternoon = out.length % 2 === 1;
    const pick =
      day.find((s) =>
        wantAfternoon ? toMin(s.time) >= LUNCH_END : toMin(s.time) < LUNCH_START,
      ) ?? day[0];
    out.push(pick);
  }
  if (out.length < max && skip.size) {
    // relax the skip-days rule if we ran out of fresh days
    const more = suggestSoonest({
      exclude: [...ex, ...out.map((s) => s.id)],
      max: max - out.length,
    });
    out.push(...more);
  }
  return out.sort(byId);
}

/** Closest openings to the requested windows when nothing matches exactly. */
export function closestSlots(
  ranges: Range[],
  exclude: string[] = [],
  max = 3,
): Slot[] {
  const ex = new Set(exclude);
  const all: Slot[] = horizonDates().flatMap(slotsOn).filter((s) => !ex.has(s.id));
  if (!ranges.length) return suggestSoonest({ exclude, max });
  const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
  const dist = (s: Slot) =>
    Math.min(
      ...ranges.map((r) => {
        const dd = Math.abs(dayNum(s.date) - dayNum(r.date)) * 1440;
        const t = toMin(s.time);
        const td = t < toMin(r.start) ? toMin(r.start) - t : t >= toMin(r.end) ? t - toMin(r.end) : 0;
        return dd + td;
      }),
    );
  const scored = all.map((s) => ({ s, d: dist(s) })).sort((a, b) => a.d - b.d || byId(a.s, b.s));
  const out: Slot[] = [];
  const days = new Set<string>();
  for (const { s } of scored) {
    if (out.length >= max) break;
    if (days.has(s.date)) continue;
    days.add(s.date);
    out.push(s);
  }
  return out.sort(byId);
}

// ---------- formatting ----------

export const dayShort = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export const dayLong = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export function time12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${pad(m)} ${ap}`;
}

export const describeWindow = (r: Range): string => {
  const full = r.start === "08:00" && r.end === "17:00";
  return full
    ? `${dayShort(r.date)} (any time)`
    : `${dayShort(r.date)} ${time12(r.start)}–${time12(r.end)}`;
};

export const describeRanges = (ranges: Range[]): string => {
  const shown = ranges.slice(0, 3).map(describeWindow);
  const more = ranges.length > 3 ? ` +${ranges.length - 3} more` : "";
  return shown.join(", ") + more;
};

// ---------- ICS ----------

function zonedToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAND.timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return new Date(guess - (asUtc - guess));
}

const icsStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function buildIcs(a: {
  date: string;
  time: string;
  summary: string;
  description: string;
  location: string;
}): string {
  const start = zonedToUtc(a.date, a.time);
  const end = new Date(start.getTime() + 30 * 60000);
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Willowbrook Medical Clinic//Demo//EN",
    "BEGIN:VEVENT",
    `UID:${slotId(a.date, a.time)}@willowbrook.demo`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${esc(a.summary)}`,
    `DESCRIPTION:${esc(a.description)}`,
    `LOCATION:${esc(a.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function defaultApptDate(): string {
  return nextBusinessDays(2)[1];
}
