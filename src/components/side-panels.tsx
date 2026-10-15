"use client";

import type { Conversation, EventItem, UiAction, UiBlock } from "@/lib/types";

const actionsOf = (b: UiBlock): UiAction[] =>
  b.kind === "card"
    ? b.actions
    : b.kind === "chips"
      ? b.chips
      : b.kind === "carousel"
        ? b.cards.flatMap((c) => c.actions)
        : [];

export function Capabilities({ conv, statuses }: { conv: Conversation | null; statuses: Record<string, string> }) {
  const blocks = conv?.messages.map((m) => m.ui) ?? [];
  const all = blocks.flatMap(actionsOf);
  const receipts = Object.values(statuses).some((s) => s.startsWith("delivered") || s.startsWith("read"));
  const items: { label: string; hint: string; on: boolean }[] = [
    { label: "Branded sender profile", hint: "Clinic name, logo and verified checkmark", on: Boolean(conv) },
    { label: "Rich card with clinic banner", hint: "Image, title, description and buttons in one message", on: blocks.some((b) => b.kind === "card" && b.mediaKey) },
    { label: "Suggested replies", hint: "One-tap Confirm / Reschedule chips", on: all.some((a) => a.kind === "reply") },
    { label: "Call, directions & calendar", hint: "Native dial, maps and add-to-calendar actions", on: all.some((a) => a.kind === "phone" || a.kind === "url") },
    { label: "In-chat webview", hint: "Pre-visit check-in opens inside the conversation", on: all.some((a) => a.webview) },
    { label: "Carousel of times", hint: "Swipe through available appointment slots", on: blocks.some((b) => b.kind === "carousel") },
    { label: "AI free-text understanding", hint: "Dates and time ranges in plain language", on: Boolean(conv?.events.some((e) => e.tone === "ai")) },
    { label: "Delivery & read receipts", hint: "Live status from the carrier network", on: receipts },
    { label: "Automatic SMS fallback", hint: "Every template carries a text version", on: true },
  ];
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-wb-ink">RCS capabilities on display</h2>
      <ul className="mt-3 space-y-2.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold transition ${
                it.on ? "bg-wb-primary text-white" : "bg-slate-100 text-slate-300"
              }`}
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className={`text-[13px] font-medium ${it.on ? "text-wb-ink" : "text-slate-400"}`}>{it.label}</p>
              <p className="text-[11.5px] leading-snug text-slate-400">{it.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONE: Record<EventItem["tone"], string> = {
  info: "bg-slate-400",
  ai: "bg-violet-500",
  send: "bg-wb-primary",
  recv: "bg-sky-500",
  warn: "bg-amber-500",
  ok: "bg-emerald-500",
};

export function ActivityLog({ events }: { events: EventItem[] }) {
  const list = [...events].reverse();
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-wb-ink">Behind the scenes</h2>
      <p className="text-[11.5px] text-slate-400">eClinicalWorks → Twilio → patient, in real time</p>
      <ol className="wb-scroll mt-3 max-h-72 space-y-2.5 overflow-y-auto pr-1">
        {list.length === 0 && <li className="text-xs text-slate-400">Events will appear here once a reminder is sent.</li>}
        {list.map((e) => (
          <li key={`${e.ts}-${e.title}`} className="flex gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[e.tone]}`} />
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium leading-snug text-slate-800">{e.title}</p>
              {e.detail && <p className="break-words text-[11.5px] leading-snug text-slate-500">{e.detail}</p>}
              <p className="text-[10.5px] text-slate-300">{new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PrivacyNote() {
  return (
    <section className="rounded-2xl bg-wb-dark p-4 text-white shadow-sm">
      <h2 className="text-sm font-semibold">Privacy-minded by design</h2>
      <ul className="mt-2 space-y-1.5 text-[12px] leading-snug text-white/75">
        <li>• Messages carry only first name, visit type and time — no diagnoses or results.</li>
        <li>• Conversation state lives in the clinic&apos;s own Twilio account.</li>
        <li>• The AI never gives medical advice and hands off to staff on request.</li>
        <li>• Production use requires a signed BAA and HIPAA-eligible Twilio products.</li>
      </ul>
      <p className="mt-2 text-[11px] text-white/45">Demo uses synthetic data only.</p>
    </section>
  );
}
