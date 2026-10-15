import type { NluResult, Range } from "./types";
import {
  addDays,
  fromMin,
  nextBusinessDays,
  parseSlotId,
  toMin,
  today,
  weekdayOf,
  OPEN,
  CLOSE,
} from "./slots";

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3, thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};
const DAY_RE =
  /\b(?:(next|this|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|sun|mon|tue|wed|thu|fri|sat)\b/g;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const MER = "(a\\.?m\\.?|p\\.?m\\.?)";

interface Win {
  start: string;
  end: string;
}

function scan(re: RegExp, s: string, fn: (m: RegExpExecArray) => void): string {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(s))) fn(m);
  return s.replace(r, " ");
}

function resolveWeekday(target: number, next: boolean, base: string): string {
  if (next) {
    let d = addDays(base, 1);
    while (weekdayOf(d) !== 1) d = addDays(d, 1);
    return addDays(d, (target + 6) % 7);
  }
  let d = addDays(base, 1);
  while (weekdayOf(d) !== target) d = addDays(d, 1);
  return d;
}

function nextOccurrence(month: number, day: number, base: string): string | null {
  const [y] = base.split("-").map(Number);
  for (const year of [y, y + 1]) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) return null;
    if (iso > base) return iso;
  }
  return null;
}

function extractDates(input: string, base: string): { dates: string[]; rest: string; anyDay: boolean } {
  const dates: string[] = [];
  let anyDay = false;
  let rest = input;

  rest = scan(/\bday after tomorrow\b/, rest, () => dates.push(addDays(base, 2)));
  rest = scan(/\btomorrow\b/, rest, () => dates.push(addDays(base, 1)));
  rest = scan(/\bnext week\b/, rest, () => {
    let d = addDays(base, 1);
    while (weekdayOf(d) !== 1) d = addDays(d, 1);
    for (let i = 0; i < 5; i++) dates.push(addDays(d, i));
  });
  rest = scan(/\bthis week\b/, rest, () => {
    let d = addDays(base, 1);
    while (weekdayOf(d) !== 6 && weekdayOf(d) !== 0) {
      dates.push(d);
      d = addDays(d, 1);
    }
  });
  rest = scan(/\b(?:any ?day|any weekday|weekdays|whenever|any ?time|flexible|all day)\b/, rest, () => {
    anyDay = true;
  });
  rest = scan(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, rest, (m) => {
    const d = nextOccurrence(Number(m[1]), Number(m[2]), base);
    if (d) dates.push(d);
  });
  rest = scan(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
    rest,
    (m) => {
      const d = nextOccurrence(MONTHS[m[1]], Number(m[2]), base);
      if (d) dates.push(d);
    },
  );
  rest = scan(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/, rest, (m) => {
    const day = Number(m[1]);
    for (let i = 1; i <= 35; i++) {
      const d = addDays(base, i);
      if (Number(d.slice(8)) === day) {
        dates.push(d);
        break;
      }
    }
  });
  rest = scan(DAY_RE, rest, (m) => {
    dates.push(resolveWeekday(DAY_MAP[m[2]], m[1] === "next", base));
  });

  return { dates: [...new Set(dates)], rest, anyDay };
}

function hourTo24(h: number, pm: boolean | undefined): number {
  if (h > 12) return h;
  if (pm === undefined) {
    if (h >= 1 && h <= 7) return h + 12;
    return h;
  }
  if (pm) return h === 12 ? 12 : h + 12;
  return h === 12 ? 0 : h;
}

const isPm = (mer?: string): boolean | undefined =>
  mer ? mer.toLowerCase().startsWith("p") : undefined;

function clampWin(startMin: number, endMin: number): Win | null {
  const s = Math.max(OPEN, startMin);
  const e = Math.min(CLOSE, endMin);
  if (s >= e) return null;
  return { start: fromMin(s), end: fromMin(e) };
}

export function parseWindow(text: string): Win | null {
  const t = text.toLowerCase();

  // explicit range: "2-4pm", "between 10 and 12", "from 1 to 3"
  const range = new RegExp(
    `(between|from)?\\s*\\b(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?\\s*(?:-|–|—|to|and|until|till)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?`,
  ).exec(t);
  if (range) {
    const h1 = Number(range[2]);
    const m1 = Number(range[3] ?? 0);
    const h2 = Number(range[5]);
    const m2 = Number(range[6] ?? 0);
    let pm1 = isPm(range[4]);
    let pm2 = isPm(range[7]);
    if (pm1 === undefined && pm2 !== undefined) pm1 = pm2;
    if (pm2 === undefined && pm1 !== undefined) pm2 = pm1;
    let s = hourTo24(h1, pm1) * 60 + m1;
    const e0 = hourTo24(h2, pm2) * 60 + m2;
    let e = e0;
    if (s >= e && isPm(range[4]) === undefined) s -= 12 * 60;
    if (e <= s && e < 12 * 60) e += 12 * 60;
    const w = clampWin(s, e);
    if (w) return w;
  }

  if (/\bbefore (noon|lunch)\b/.test(t)) return clampWin(OPEN, 12 * 60);
  if (/\bafter lunch\b/.test(t)) return clampWin(13 * 60, CLOSE);

  const after = new RegExp(
    `\\b(?:after|later than|starting at|past)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?`,
  ).exec(t);
  if (after) {
    const s = hourTo24(Number(after[1]), isPm(after[3])) * 60 + Number(after[2] ?? 0);
    const w = clampWin(s, CLOSE);
    if (w) return w;
  }

  const before = new RegExp(
    `\\b(?:before|by|until|earlier than|no later than)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?`,
  ).exec(t);
  if (before) {
    const e = hourTo24(Number(before[1]), isPm(before[3])) * 60 + Number(before[2] ?? 0);
    const w = clampWin(OPEN, e);
    if (w) return w;
  }

  const at = new RegExp(
    `\\b(?:(at|around|about|near)\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*${MER}`,
  ).exec(t);
  const atBare = new RegExp(`\\b(?:at|around|about|near)\\s+(\\d{1,2})(?::(\\d{2}))?\\b`).exec(t);
  if (at || atBare) {
    const h = Number(at ? at[2] : atBare![1]);
    const mi = Number(at ? at[3] ?? 0 : atBare![2] ?? 0);
    const pm = at ? isPm(at[4]) : undefined;
    const s = hourTo24(h, pm) * 60 + mi;
    const around = at ? at[1] === "around" || at[1] === "about" || at[1] === "near" : false;
    const w = around ? clampWin(s - 30, s + 90) : clampWin(s, s + 60);
    if (w) return w;
  }

  if (/\blate (morning)\b/.test(t)) return clampWin(10 * 60, 12 * 60);
  if (/\bearly\b/.test(t)) return clampWin(OPEN, 10 * 60);
  if (/\b(late afternoon|evening|end of (the )?day|after work)\b/.test(t)) return clampWin(15 * 60, CLOSE);
  if (/\bmornings?\b/.test(t)) return clampWin(OPEN, 12 * 60);
  if (/\bafternoons?\b/.test(t)) return clampWin(13 * 60, CLOSE);
  if (/\b(noon|midday|lunch ?time)\b/.test(t)) return clampWin(11 * 60, 14 * 60);
  return null;
}

export function parseRanges(raw: string, base = today()): Range[] {
  let text = raw.toLowerCase().replace(/\bbetween\s+([\d:apm. ]+?)\s+and\s+/g, "between $1 to ");
  text = text.replace(/[“”"]/g, "");
  const segments = text.split(/\s*(?:,|;|\bor\b|\band\b|\bplus\b|&)\s*/).filter(Boolean);

  const parsed = segments.map((seg) => {
    const { dates, rest, anyDay } = extractDates(seg, base);
    return { dates, win: parseWindow(rest), anyDay };
  });

  const globalWin = parsed.find((p) => p.win)?.win ?? null;
  const globalDates = [...new Set(parsed.flatMap((p) => p.dates))];
  const wantsAny = parsed.some((p) => p.anyDay);

  if (!globalDates.length && !globalWin && !wantsAny) return [];

  const out = new Map<string, Range>();
  const defaultWin: Win = { start: fromMin(OPEN), end: fromMin(CLOSE) };

  for (const p of parsed) {
    const dates = p.dates.length ? p.dates : [];
    for (const d of dates) {
      const win = p.win ?? globalWin ?? defaultWin;
      out.set(d, { date: d, ...win });
    }
  }
  if (!globalDates.length) {
    for (const d of nextBusinessDays(10, base)) {
      out.set(d, { date: d, ...(globalWin ?? defaultWin) });
    }
  }
  return [...out.values()]
    .filter((r) => r.date > base)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
}

// ---------- slot selection from free text ----------

function matchOffered(t: string, offered: string[]): number | null {
  if (!offered.length) return null;
  const bare = /^\s*(?:option\s*|number\s*|#)?([1-4])\s*[.)!]?\s*$/.exec(t);
  if (bare && Number(bare[1]) <= offered.length) return Number(bare[1]) - 1;
  if (/\b(first|1st)\b/.test(t)) return 0;
  if (/\b(second|2nd)\b/.test(t) && offered.length > 1) return 1;
  if (/\b(third|3rd)\b/.test(t) && offered.length > 2) return 2;
  if (/\b(fourth|4th)\b/.test(t) && offered.length > 3) return 3;
  if (/\blast one\b|\blatest\b/.test(t)) return offered.length - 1;
  if (/\b(earliest|soonest)\b/.test(t)) return 0;

  const hasWindowWords = /\b(between|after|before|from|until|anytime|any time)\b/.test(t) || /\d\s*-\s*\d/.test(t);
  const slots = offered.map((id) => parseSlotId(id));

  if (!hasWindowWords) {
    const tm = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?`, "g");
    const hits = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = tm.exec(t))) {
      const h = Number(m[1]);
      if (h < 1 || h > 12) continue;
      const mins = hourTo24(h, isPm(m[3])) * 60 + Number(m[2] ?? 0);
      slots.forEach((s, i) => {
        if (s && toMin(s.time) === mins) hits.add(i);
      });
    }
    if (hits.size === 1) return [...hits][0];
  }

  const affirm = /\b(works?|good|perfect|great|book|take|that one|please|yes|ok|okay|sounds)\b/.test(t);
  if (affirm && !hasWindowWords && !parseWindow(t)) {
    const names = [...t.matchAll(DAY_RE)].map((m) => DAY_MAP[m[2]]);
    if (names.length === 1) {
      const idxs = slots
        .map((s, i) => (s && weekdayOf(s.date) === names[0] ? i : -1))
        .filter((i) => i >= 0);
      if (idxs.length === 1) return idxs[0];
    }
  }
  if (offered.length === 1 && /^(yes|y|yep|yeah|sure|ok|okay|book it|that works|sounds good|perfect)\b/.test(t)) return 0;
  return null;
}

export function ruleNlu(
  raw: string,
  ctx: { status: string; offered: string[] },
  base = today(),
): NluResult {
  const t = raw.toLowerCase().trim();
  const mk = (r: Omit<NluResult, "source">): NluResult => ({ source: "rules", ...r });

  if (!t) return mk({ intent: "unknown" });

  if (/\b(human|real person|staff|receptionist|representative|operator|call me|speak (to|with)|talk to (a |someone|staff|the))\b/.test(t)) {
    return mk({ intent: "human" });
  }

  const sel = matchOffered(t, ctx.offered);
  if (sel !== null) return mk({ intent: "select_slot", slotIndex: sel + 1 });

  if (/\b(show|see|get|any) more\b|\b(more|other|different|else)\b.*\b(times?|options?|slots?)\b/.test(t)) {
    return mk({ intent: "more" });
  }

  if (/^(none|neither|nope)\b|none of (these|those)|(don'?t|doesn'?t|do not) work|not (these|those)/.test(t)) {
    return mk({ intent: "reschedule" });
  }

  const ranges = parseRanges(t, base);
  if (ranges.length) return mk({ intent: "availability", ranges });

  if (/^(keep|leave it|keep it|keep my)/.test(t)) return mk({ intent: "keep" });

  const resched = /re-?schedul|\bchange\b|move (it|my|the)|another (time|day)|different (time|day)|can'?t make|cannot make|can not make|won'?t (be able|make)|not able|conflict|something came up|^2$|^no\b|^nope/.test(t);
  if (resched) return mk({ intent: "reschedule" });

  if (
    ctx.status === "reminded" &&
    t.length <= 48 &&
    /^(yes|y|yep|yeah|yup|confirm(ed)?|i confirm|ok(ay)?|sure|i'?ll be there|see you( then)?|sounds good|that works|correct|1|👍)\b/.test(t)
  ) {
    return mk({ intent: "confirm" });
  }
  if (/^(yes|y|yep|yeah|yup|confirm(ed)?)\b/.test(t) && ctx.status !== "rescheduling") {
    return mk({ intent: "confirm" });
  }

  if (/^(thanks|thank you|thx|ty|great|awesome|perfect)\b/.test(t)) {
    return mk({ intent: "question", reply: "You're very welcome! Is there anything else I can help you with?" });
  }
  if (/\?|\b(when|where|what|how|parking|bring|cost|insurance|copay)\b/.test(t)) {
    return mk({ intent: "question" });
  }
  return mk({ intent: "unknown" });
}
