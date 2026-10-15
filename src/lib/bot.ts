import { BRAND } from "./brand";
import { deleteConv, loadConv, logEvent, saveConv } from "./conv-store";
import { deliver, openSession, type Session } from "./messenger";
import { understand } from "./nlu";
import {
  addDays,
  closestSlots,
  dayLong,
  dayShort,
  defaultApptDate,
  describeRanges,
  findSlots,
  isSlotAvailable,
  nextBusinessDays,
  parseSlotId,
  slotId,
  suggestSoonest,
  time12,
  today,
  weekdayOf,
  type Slot,
} from "./slots";
import { withLock } from "./store";
import { convKey, toE164 } from "./phone";
import { makeToken } from "./token";
import type { Appt, Conversation, DeliveryMode, NluResult, Range, UiAction, UiBlock } from "./types";

// ---------- small helpers ----------

const rid = () => Math.random().toString(36).slice(2, 10);
const replyA = (label: string, id: string): UiAction => ({ kind: "reply", label, id });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (a: Pick<Appt, "date" | "time">) => `${dayLong(a.date)} at ${time12(a.time)}`;
const apptSlotId = (a: Pick<Appt, "date" | "time">) => slotId(a.date, a.time);
const endSentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

const say = (s: Session, text: string) => deliver(s, { kind: "text", text });
const sendTpl = (s: Session, key: string, vars: Record<string, string>, ui: UiBlock) =>
  deliver(s, { kind: "template", key, vars, ui });

const SLOT_IMG = "slot" as const;

// ---------- outbound building blocks ----------

async function sendReminderCard(s: Session): Promise<void> {
  const { conv } = s;
  const a = conv.appt;
  const body = `Hi ${conv.firstName}, this is ${BRAND.clinicName}. This is a reminder of your ${a.type} with ${a.provider} on ${when(a)}.\n\nPlease confirm your appointment, or let us know if you need a different time.`;
  await sendTpl(s, "reminder", { "1": body }, {
    kind: "card",
    mediaKey: "banner",
    title: "Appointment reminder",
    body,
    actions: [
      replyA("Confirm", "confirm"),
      replyA("Reschedule", "reschedule"),
      { kind: "phone", label: "Call clinic", href: `tel:${BRAND.phone}` },
      { kind: "url", label: "Get directions", href: BRAND.mapsUrl },
    ],
  });
}

async function sendConfirmedCard(s: Session, kind: "confirmed" | "rescheduled"): Promise<void> {
  const { conv, cfg } = s;
  const a = conv.appt;
  const title = kind === "confirmed" ? `You're confirmed, ${conv.firstName} ✓` : `Rescheduled — see you soon, ${conv.firstName} ✓`;
  const body = `${cap(a.type)} with ${a.provider}\n${when(a)}\n${BRAND.clinicName}\n${BRAND.address}`;
  const token = makeToken(a, conv.firstName);
  const base = cfg.publicAppUrl;
  const actions: UiAction[] = [];
  if (base) {
    actions.push({ kind: "url", label: "Add to calendar", href: `${base}/api/ics?t=${token}` });
    actions.push({ kind: "url", label: "Pre-visit check-in", href: `${base}/checkin?t=${token}`, webview: true });
  }
  actions.push({ kind: "url", label: "Get directions", href: BRAND.mapsUrl });
  actions.push({ kind: "phone", label: "Call clinic", href: `tel:${BRAND.phone}` });
  if (actions.length < 4) actions.push(replyA("Reschedule", "reschedule"));
  await sendTpl(s, "confirmed", { "1": title, "2": body, "3": token }, {
    kind: "card",
    mediaKey: "confirmed",
    title,
    body,
    actions,
  });
}

async function sendSlots(s: Session, slots: Slot[], tail: "reschedule" | "after"): Promise<void> {
  const { conv } = s;
  const picked = slots.slice(0, 4);
  conv.offered = picked.map((x) => x.id);
  conv.seen = [...new Set([...conv.seen, ...conv.offered])];

  if (picked.length === 1) {
    const one = picked[0];
    const body = `I found one opening: ${dayShort(one.date)} at ${time12(one.time)} with ${conv.appt.provider}. Would you like to book it?`;
    await sendTpl(s, "chips_single", { "1": body, "2": one.id }, {
      kind: "chips",
      body,
      chips: [replyA("Book this time", `slot_${one.id}`), replyA("Other times", "more"), replyA("Keep current time", "keep")],
    });
    return;
  }

  const vars: Record<string, string> = {};
  const cards = picked.map((sl, i) => {
    const a = 3 * i + 1;
    const title = dayShort(sl.date);
    const body = `${time12(sl.time)} · ${conv.appt.provider}`;
    vars[String(a)] = title;
    vars[String(a + 1)] = body;
    vars[String(a + 2)] = sl.id;
    return { mediaKey: SLOT_IMG, title, body, actions: [replyA("Book this time", `slot_${sl.id}`)] };
  });
  await sendTpl(s, `slots_${picked.length}`, vars, { kind: "carousel", cards });

  if (tail === "reschedule") {
    const body = "Prefer something different? Tap a preference or type the days and times that work for you.";
    await sendTpl(s, "chips_reschedule", { "1": body }, {
      kind: "chips",
      body,
      chips: [replyA("Mornings", "pref_morning"), replyA("Afternoons", "pref_afternoon"), replyA("Next week", "pref_nextweek"), replyA("Talk to staff", "human")],
    });
  } else {
    const body = "Tap a time above, or reply with your own days and times.";
    await sendTpl(s, "chips_after_slots", { "1": body }, {
      kind: "chips",
      body,
      chips: [replyA("Show more times", "more"), replyA("None of these work", "none"), replyA("Keep current time", "keep"), replyA("Talk to staff", "human")],
    });
  }
}

async function sendRescheduleChips(s: Session, body: string): Promise<void> {
  await sendTpl(s, "chips_reschedule", { "1": body }, {
    kind: "chips",
    body,
    chips: [replyA("Mornings", "pref_morning"), replyA("Afternoons", "pref_afternoon"), replyA("Next week", "pref_nextweek"), replyA("Talk to staff", "human")],
  });
}

async function sendConfirmChips(s: Session, body: string): Promise<void> {
  await sendTpl(s, "chips_confirm", { "1": body }, {
    kind: "chips",
    body,
    chips: [replyA("Confirm", "confirm"), replyA("Reschedule", "reschedule"), replyA("Talk to staff", "human")],
  });
}

// ---------- conversation actions ----------

async function confirmCurrent(s: Session): Promise<void> {
  const { conv } = s;
  if (conv.status === "confirmed" || conv.status === "rescheduled") {
    await say(s, `You're all set for ${when(conv.appt)}, ${conv.firstName}. If you need to change it, just say "reschedule".`);
    return;
  }
  conv.status = "confirmed";
  conv.offered = [];
  logEvent(conv, "ok", "Appointment confirmed", "Status written back to eClinicalWorks (simulated)");
  await say(s, `Thank you, ${conv.firstName}! Your appointment is confirmed. Here are your details:`);
  await sendConfirmedCard(s, "confirmed");
}

async function startReschedule(s: Session): Promise<void> {
  const { conv } = s;
  conv.status = "rescheduling";
  const slots = suggestSoonest({ exclude: [apptSlotId(conv.appt)], max: 3 });
  await say(
    s,
    `No problem, ${conv.firstName}! Let's find a better time for your ${conv.appt.type}. Here are a few of the soonest openings with ${conv.appt.provider} — or just tell me which days and times work for you, like "Thursday afternoon or Friday before noon."`,
  );
  await sendSlots(s, slots, "reschedule");
}

async function askForRanges(s: Session): Promise<void> {
  s.conv.status = "rescheduling";
  await say(
    s,
    `No problem, ${s.conv.firstName}. Tell me which days and time ranges work best — for example "Tuesday morning" or "anytime after 2 on Friday" — and I'll find the best match.`,
  );
  await sendRescheduleChips(s, "Or tap a quick preference:");
}

async function offerForRanges(s: Session, ranges: Range[], ack?: string): Promise<void> {
  const { conv } = s;
  conv.status = "rescheduling";
  conv.lastRanges = ranges;
  const cur = apptSlotId(conv.appt);
  const slots = findSlots(ranges, { exclude: [cur], max: 3 });
  const summary = describeRanges(ranges);
  const forPart = ranges.length <= 2 ? ` for ${summary}` : "";
  if (slots.length) {
    const lead = ack
      ? `${endSentence(ack)} Here ${slots.length === 1 ? "is the opening" : "are the openings"} I found${forPart}:`
      : `Thanks, ${conv.firstName}! Here ${slots.length === 1 ? "is the opening" : "are the openings"} that fit${forPart || " your availability"}:`;
    await say(s, lead);
    await sendSlots(s, slots, "after");
    return;
  }
  const near = closestSlots(ranges, [cur], 3);
  await say(
    s,
    `I don't have any openings${forPart || " in those windows"}, but these are the closest times I can offer. You can also tell me other days or times.`,
  );
  await sendSlots(s, near, "after");
}

async function offerMore(s: Session): Promise<void> {
  const { conv } = s;
  const ex = [...conv.seen, apptSlotId(conv.appt)];
  let slots = conv.lastRanges.length ? findSlots(conv.lastRanges, { exclude: ex, max: 3 }) : [];
  if (!slots.length) {
    const skipDates = conv.seen.map((id) => parseSlotId(id)?.date ?? "");
    slots = suggestSoonest({ exclude: ex, skipDates, max: 3 });
  }
  conv.status = "rescheduling";
  await say(s, "Sure — here are a few more options:");
  await sendSlots(s, slots, "after");
}

async function bookSlot(s: Session, id: string): Promise<void> {
  const { conv } = s;
  const p = parseSlotId(id);
  if (!p || !isSlotAvailable(id)) {
    await say(s, "Sorry, that time is no longer available. Here are some other options:");
    await sendSlots(s, suggestSoonest({ exclude: [...conv.seen, apptSlotId(conv.appt)], max: 3 }), "after");
    return;
  }
  const before = when(conv.appt);
  conv.appt = { ...conv.appt, date: p.date, time: p.time };
  conv.status = "rescheduled";
  conv.offered = [];
  logEvent(conv, "ok", "Appointment rescheduled", `${before} → ${when(conv.appt)} · written back to eClinicalWorks (simulated)`);
  await say(s, `Done! I've moved your ${conv.appt.type} to ${when(conv.appt)} with ${conv.appt.provider}. 🌿`);
  await sendConfirmedCard(s, "rescheduled");
}

async function escalate(s: Session): Promise<void> {
  s.conv.status = "escalated";
  logEvent(s.conv, "warn", "Handoff to staff requested", "Routed to front-desk queue (simulated)");
  await say(
    s,
    `Of course — I've let the ${BRAND.shortName} front-desk team know and someone will reach out shortly. You can also call us anytime at ${BRAND.phoneDisplay}.`,
  );
}

async function clarify(s: Session, reply?: string): Promise<void> {
  const { conv } = s;
  const a = conv.appt;
  if (conv.status === "reminded") {
    await sendConfirmChips(
      s,
      reply ?? `I can help you confirm or reschedule your ${a.type} on ${when(a)}. What would you like to do?`,
    );
  } else if (conv.status === "rescheduling") {
    await sendRescheduleChips(
      s,
      reply ?? `Sorry, I didn't quite catch that. Tell me which days and times work for you — for example "Thursday afternoon" — or tap a preference.`,
    );
  } else {
    await say(s, reply ?? `You're all set for ${when(a)}. If you need to change it, just say "reschedule".`);
  }
}

// ---------- routing ----------

function prefRanges(pref: string): Range[] {
  if (pref === "nextweek") {
    let d = addDays(today(), 1);
    while (weekdayOf(d) !== 1) d = addDays(d, 1);
    return Array.from({ length: 5 }, (_, i) => ({ date: addDays(d, i), start: "08:00", end: "17:00" }));
  }
  const days = nextBusinessDays(6);
  const [start, end] = pref === "morning" ? ["08:00", "12:00"] : ["13:00", "17:00"];
  return days.map((date) => ({ date, start, end }));
}

const PREF_ACK: Record<string, string> = {
  pref_morning: "Mornings it is!",
  pref_afternoon: "Afternoons it is!",
  pref_nextweek: "Next week works — noted!",
};

const PAYLOAD_LABELS: Record<string, string> = {
  confirm: "Confirm",
  reschedule: "Reschedule",
  more: "Show more times",
  none: "None of these work",
  keep: "Keep current time",
  human: "Talk to staff",
  pref_morning: "Mornings",
  pref_afternoon: "Afternoons",
  pref_nextweek: "Next week",
};

function displayFor(text: string, payload?: string): string {
  if (payload?.startsWith("slot_")) {
    const p = parseSlotId(payload.slice(5));
    if (p) return `${dayShort(p.date)} at ${time12(p.time)}`;
  }
  return text || (payload ? PAYLOAD_LABELS[payload] ?? payload : "");
}

async function routePayload(s: Session, payload: string): Promise<boolean> {
  const { conv } = s;
  if (payload.startsWith("slot_")) {
    logEvent(conv, "info", "Patient picked a time", payload.slice(5));
    await bookSlot(s, payload.slice(5));
    return true;
  }
  if (payload.startsWith("pref_")) {
    const key = payload.slice(5);
    await offerForRanges(s, prefRanges(key), PREF_ACK[payload]);
    return true;
  }
  switch (payload) {
    case "confirm":
    case "keep":
      await confirmCurrent(s);
      return true;
    case "reschedule":
      if (conv.status === "rescheduling" && conv.offered.length) await askForRanges(s);
      else await startReschedule(s);
      return true;
    case "more":
      await offerMore(s);
      return true;
    case "none":
      await askForRanges(s);
      return true;
    case "human":
      await escalate(s);
      return true;
    default:
      return false;
  }
}

async function act(s: Session, nlu: NluResult): Promise<void> {
  const { conv } = s;
  switch (nlu.intent) {
    case "confirm":
    case "keep":
      return confirmCurrent(s);
    case "reschedule":
      return conv.status === "rescheduling" ? askForRanges(s) : startReschedule(s);
    case "availability":
      if (nlu.ranges?.length) return offerForRanges(s, nlu.ranges, nlu.ack);
      return askForRanges(s);
    case "select_slot": {
      const id = conv.offered[(nlu.slotIndex ?? 0) - 1];
      if (id) return bookSlot(s, id);
      return clarify(s);
    }
    case "more":
      return offerMore(s);
    case "human":
      return escalate(s);
    case "question":
    case "unknown":
    default:
      return clarify(s, nlu.reply);
  }
}

async function processInbound(s: Session, input: { text: string; payload?: string }): Promise<void> {
  const { conv } = s;
  const payload = input.payload?.trim() || undefined;
  const text = input.text?.trim() ?? "";

  conv.messages.push({
    id: rid(),
    dir: "in",
    ts: Date.now(),
    channel: conv.mode === "live" ? "rcs" : "sim",
    ui: { kind: "reply", text: displayFor(text, payload), viaButton: Boolean(payload) },
  });
  logEvent(conv, "recv", payload ? "Button tapped" : "Patient message", payload ? `${payload}${text ? ` · "${text}"` : ""}` : text);
  await saveConv(conv);

  if (payload && (await routePayload(s, payload))) return;

  const history = conv.messages
    .filter((m) => m.dir === "in" && m.ui.kind === "reply")
    .slice(0, -1)
    .map((m) => (m.ui.kind === "reply" ? m.ui.text : ""));
  const nlu = await understand(text || payload || "", {
    firstName: conv.firstName,
    status: conv.status,
    apptLabel: `${conv.appt.type} with ${conv.appt.provider} on ${when(conv.appt)}`,
    offered: conv.offered,
    history,
  });
  const detail =
    nlu.intent === "availability" && nlu.ranges
      ? describeRanges(nlu.ranges)
      : nlu.intent === "select_slot"
        ? `Option ${nlu.slotIndex}`
        : undefined;
  logEvent(conv, "ai", `${nlu.source === "ai" ? "AI" : "Rules"} understood: ${nlu.intent.replace("_", " ")}`, detail);
  await saveConv(conv);
  await act(s, nlu);
}

// ---------- public entry points ----------

export interface ReminderInput {
  phone: string;
  firstName: string;
  apptType: string;
  mode: DeliveryMode;
}

export async function startReminder(input: ReminderInput): Promise<Conversation> {
  const phone = toE164(input.phone);
  const key = convKey(phone);
  return withLock(key, async () => {
    await deleteConv(key);
    const appt: Appt = {
      type: input.apptType,
      provider: BRAND.provider,
      date: defaultApptDate(),
      time: "10:30",
    };
    const now = Date.now();
    const conv: Conversation = {
      key,
      phone,
      mode: input.mode,
      firstName: input.firstName.trim() || "there",
      status: "reminded",
      appt,
      original: { ...appt },
      offered: [],
      seen: [],
      lastRanges: [],
      typing: false,
      messages: [],
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    logEvent(conv, "info", "Reminder triggered", `eClinicalWorks scheduler → Twilio · ${when(appt)}`);
    await saveConv(conv);
    const s = await openSession(conv);
    await sendReminderCard(s);
    return conv;
  });
}

export async function handleInbound(phone: string, input: { text: string; payload?: string }): Promise<void> {
  const key = convKey(phone);
  await withLock(key, async () => {
    const conv = await loadConv(key);
    if (!conv) return;
    const s = await openSession(conv);
    try {
      await processInbound(s, input);
    } catch (err) {
      logEvent(conv, "warn", "Bot error", err instanceof Error ? err.message : String(err));
    } finally {
      conv.typing = false;
      await saveConv(conv);
    }
  });
}
