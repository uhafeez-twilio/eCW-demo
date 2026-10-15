import type { Intent, NluResult, Range } from "./types";
import { ruleNlu, parseRanges } from "./rules-nlu";
import { dayLong, dayShort, time12, today, weekdayOf, parseSlotId, fromMin, toMin, OPEN, CLOSE } from "./slots";
import { BRAND } from "./brand";

export interface NluContext {
  firstName: string;
  status: string;
  apptLabel: string;
  offered: string[];
  history: string[];
}

const INTENTS: Intent[] = [
  "confirm", "reschedule", "select_slot", "availability", "more", "keep", "human", "question", "unknown",
];

export const aiEnabled = (): boolean => Boolean(process.env.OPENAI_API_KEY);

function offeredLabel(id: string, i: number): string {
  const p = parseSlotId(id);
  return p ? `${i + 1}. ${dayShort(p.date)} at ${time12(p.time)}` : `${i + 1}. ${id}`;
}

function cleanRanges(input: unknown): Range[] {
  if (!Array.isArray(input)) return [];
  const t = today();
  const out: Range[] = [];
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const { date, start, end } = r as Record<string, string>;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || date <= t) continue;
    if (!/^\d{1,2}:\d{2}$/.test(start ?? "") || !/^\d{1,2}:\d{2}$/.test(end ?? "")) continue;
    const s = Math.max(OPEN, toMin(start));
    const e = Math.min(CLOSE, toMin(end));
    if (s >= e) continue;
    out.push({ date, start: fromMin(s), end: fromMin(e) });
  }
  return out.slice(0, 10);
}

function systemPrompt(ctx: NluContext): string {
  const t = today();
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekdayOf(t)];
  return `You are ${BRAND.botName}, the virtual assistant for ${BRAND.clinicName} in Nashville, TN. You text with patients about appointment reminders and rescheduling. Understand the patient's latest message and return ONLY a JSON object.

Today is ${wd}, ${dayLong(t)} (${t}). Clinic time zone: ${BRAND.timezone}. The clinic is open Monday-Friday 08:00-17:00 (closed 12:00-13:00 for lunch). Same-day appointments are not available.
Patient: ${ctx.firstName}. Current appointment: ${ctx.apptLabel}. Conversation status: ${ctx.status}.
Times currently offered to the patient:
${ctx.offered.length ? ctx.offered.map(offeredLabel).join("\n") : "(none)"}

JSON schema:
{
  "intent": one of ${INTENTS.map((i) => `"${i}"`).join(", ")},
  "slotIndex": number (1-based index into the offered times, only for select_slot),
  "ranges": [{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}] (24-hour; only for availability),
  "ack": string (max 12 words, a warm acknowledgement of their preference WITHOUT naming any specific appointment time),
  "reply": string (only for question/unknown/human: a brief friendly answer, max 2 sentences)
}
Rules:
- confirm: patient confirms the current appointment. reschedule: wants to change but gave no dates/times. keep: wants to keep the current time.
- availability: patient gave days and/or time windows. Convert to concrete dates and 24-hour ranges (morning=08:00-12:00, afternoon=13:00-17:00, "after 3pm"=15:00-17:00, no time given = 08:00-17:00). "next week" means Monday-Friday of next week. Expand every day mentioned into its own range.
- select_slot: patient picks one of the offered times (by number, day, or time).
- more: wants additional options. human: wants to speak to staff.
- question/unknown: anything else. Never give medical advice or discuss symptoms; for clinical questions say the care team will follow up or suggest calling ${BRAND.phoneDisplay}.
- Never invent appointment times. Never include medical details.`;
}

async function callOpenAI(text: string, ctx: NluContext): Promise<NluResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(ctx) },
          ...ctx.history.slice(-6).map((h) => ({ role: "user" as const, content: h })),
          { role: "user", content: `Patient's latest message: ${text}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const intent = INTENTS.includes(j.intent as Intent) ? (j.intent as Intent) : "unknown";
    const result: NluResult = { intent, source: "ai" };
    if (typeof j.slotIndex === "number") result.slotIndex = j.slotIndex;
    if (intent === "availability") result.ranges = cleanRanges(j.ranges);
    if (typeof j.ack === "string") result.ack = j.ack.slice(0, 140);
    if (typeof j.reply === "string") result.reply = j.reply.slice(0, 320);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function understand(text: string, ctx: NluContext): Promise<NluResult> {
  const rules = ruleNlu(text, { status: ctx.status, offered: ctx.offered });
  const ai = await callOpenAI(text, ctx);
  if (!ai) return rules;

  if (ai.intent === "availability" && !ai.ranges?.length) {
    const r = rules.ranges?.length ? rules.ranges : parseRanges(text);
    if (!r.length) return { ...rules, intent: "reschedule", source: "ai" };
    ai.ranges = r;
  }
  if (ai.intent === "select_slot") {
    const idx = ai.slotIndex ?? 0;
    if (idx < 1 || idx > ctx.offered.length) {
      return rules.intent === "select_slot" ? rules : { ...ai, intent: "unknown" };
    }
  }
  return ai;
}
