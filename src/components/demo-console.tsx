"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { APPOINTMENT_TYPES, BRAND } from "@/lib/brand";
import { api, type ConfigSnapshot } from "@/lib/client-api";
import { useConversation } from "@/lib/use-conversation";
import { dayLong, time12 } from "@/lib/slots";
import type { ConvStatus, DeliveryMode } from "@/lib/types";
import { PhoneSimulator } from "./phone-simulator";
import { SettingsSheet } from "./settings-sheet";
import { ActivityLog, Capabilities, PrivacyNote } from "./side-panels";
import { WillowMark } from "./willow-mark";

const SIM_PHONE = "+16155550100";

const STATUS_STYLE: Record<ConvStatus, { label: string; cls: string }> = {
  reminded: { label: "Reminder sent · awaiting patient", cls: "bg-amber-100 text-amber-800" },
  rescheduling: { label: "Rescheduling in progress", cls: "bg-violet-100 text-violet-800" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800" },
  rescheduled: { label: "Rescheduled & confirmed", cls: "bg-emerald-100 text-emerald-800" },
  escalated: { label: "Handed off to staff", cls: "bg-rose-100 text-rose-800" },
};

function Dot({ ok }: { ok: boolean }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-400"}`} />;
}

export function DemoConsole() {
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<DeliveryMode>("sim");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("Alex");
  const [apptType, setApptType] = useState<string>(APPOINTMENT_TYPES[0]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // restore saved inputs (deferred so we never set state synchronously in the effect)
  useEffect(() => {
    const id = setTimeout(() => {
      const m = localStorage.getItem("wb.mode");
      if (m === "live" || m === "sim") setMode(m);
      setFirstName(localStorage.getItem("wb.name") ?? "Alex");
      const t = localStorage.getItem("wb.type");
      if (t && (APPOINTMENT_TYPES as readonly string[]).includes(t)) setApptType(t);
      setPhone(localStorage.getItem("wb.phone") ?? "");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<ConfigSnapshot>("/api/config")
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        if (!localStorage.getItem("wb.phone") && snap.defaultPhone) setPhone(snap.defaultPhone);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const effectivePhone = phone.trim() || (mode === "sim" ? SIM_PHONE : "");
  const { conv, statuses, refresh, reset } = useConversation(effectivePhone);
  const convMode = conv?.mode ?? mode;

  const persist = (k: string, v: string) => localStorage.setItem(k, v);

  async function sendReminder() {
    setError("");
    setSending(true);
    try {
      await api("/api/reminder", {
        method: "POST",
        body: JSON.stringify({ phone: effectivePhone, firstName, apptType, mode }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reminder.");
      await refresh();
    } finally {
      setSending(false);
    }
  }

  async function patientSends(input: { text: string; payload?: string }) {
    setError("");
    try {
      await api("/api/simulate", { method: "POST", body: JSON.stringify({ phone: effectivePhone, ...input }) });
      setTimeout(refresh, 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    }
  }

  const st = snapshot?.status;
  const liveReady = Boolean(st?.credsReady && st.senderReady);
  const appt = conv?.appt;

  return (
    <div className="min-h-screen bg-[radial-gradient(60rem_30rem_at_50%_-10%,#cfe8d5_0%,transparent_60%)]">
      {/* header */}
      <header className="border-b border-wb-mint/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <WillowMark className="h-10 w-10" />
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight text-wb-ink sm:text-lg">{BRAND.clinicName}</h1>
            <p className="truncate text-[11.5px] text-slate-500">
              Powered by <b className="font-semibold text-wb-primary">{BRAND.poweredBy}</b> · messaging by Twilio RCS
            </p>
          </div>
          <span className="hidden rounded-full bg-wb-mint/70 px-3 py-1 text-[11.5px] font-medium text-wb-dark md:inline">{BRAND.eventName}</span>
          <nav className="flex items-center gap-1.5 text-[13px]">
            <Link href="/setup" className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
              Setup guide
            </Link>
            <Link href="/assets" className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
              Assets
            </Link>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg bg-wb-dark px-3.5 py-1.5 font-medium text-white transition hover:bg-wb-primary"
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:grid-cols-2 lg:grid-cols-[340px_minmax(0,1fr)_320px]">
        {/* A: scenario */}
        <div className="space-y-4 md:col-start-1 md:row-start-1 lg:col-start-1">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-wb-ink">Patient scenario</h2>

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  ["sim", "Simulator"],
                  ["live", "Live RCS"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    persist("wb.mode", m);
                  }}
                  className={`rounded-lg py-1.5 text-[13px] font-medium transition ${
                    mode === m ? "bg-white text-wb-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-slate-500">
              {mode === "sim"
                ? "Tap buttons and type as the patient right here — no phone or Twilio setup needed."
                : "Sends real RCS messages to your registered test device and listens for its replies."}
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Patient first name</span>
                <input
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    persist("wb.name", e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] outline-none focus:border-wb-primary focus:ring-2 focus:ring-wb-primary/20"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  {mode === "live" ? "Registered test device (mobile)" : "Patient mobile (optional)"}
                </span>
                <input
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => {
                    setPhone(e.target.value);
                    persist("wb.phone", e.target.value);
                  }}
                  placeholder="+1 615 555 0123"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13.5px] outline-none focus:border-wb-primary focus:ring-2 focus:ring-wb-primary/20"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Appointment type</span>
                <select
                  value={apptType}
                  onChange={(e) => {
                    setApptType(e.target.value);
                    persist("wb.type", e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] capitalize outline-none focus:border-wb-primary focus:ring-2 focus:ring-wb-primary/20"
                >
                  {APPOINTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={sendReminder}
                disabled={sending}
                className="flex-1 rounded-xl bg-wb-primary px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition enabled:hover:bg-wb-dark disabled:opacity-60"
              >
                {sending ? "Sending…" : mode === "live" ? "Send RCS reminder" : "Send simulated reminder"}
              </button>
              <button
                onClick={() => reset()}
                disabled={!conv}
                className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-[13px] font-medium text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-40"
              >
                Reset
              </button>
            </div>

            {mode === "live" && snapshot && !liveReady && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
                Live mode needs Twilio credentials and an RCS sender.{" "}
                <button onClick={() => setShowSettings(true)} className="font-semibold underline">
                  Open settings
                </button>
              </p>
            )}
            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] leading-snug text-rose-800">{error}</p>}
          </section>

          {/* EHR record */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-wb-ink">{BRAND.poweredBy} appointment record</h2>
              {conv && (
                <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[conv.status].cls}`}>
                  {STATUS_STYLE[conv.status].label}
                </span>
              )}
            </div>
            {appt && conv ? (
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Patient</dt>
                  <dd className="font-medium text-slate-800">{conv.firstName} (synthetic)</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Visit</dt>
                  <dd className="font-medium capitalize text-slate-800">{appt.type}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Provider</dt>
                  <dd className="font-medium text-slate-800">{appt.provider}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">When</dt>
                  <dd className="text-right font-semibold text-wb-primary">
                    {dayLong(appt.date)}
                    <br />
                    {time12(appt.time)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-slate-400">The appointment record updates here as the patient replies.</p>
            )}
          </section>

          {/* readiness */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-wb-ink">Connection status</h2>
            <ul className="mt-3 space-y-2 text-[12.5px] text-slate-600">
              <li className="flex items-center gap-2">
                <Dot ok={Boolean(st?.credsReady)} />
                {st?.credsReady
                  ? `Twilio ${st.credsSource === "custom" ? "sandbox" : "demo account"} · ${st.accountSid}`
                  : "No Twilio credentials"}
              </li>
              <li className="flex items-center gap-2">
                <Dot ok={Boolean(st?.senderReady)} />
                {st?.senderReady ? "RCS sender configured" : "RCS sender not set"}
              </li>
              <li className="flex items-center gap-2">
                <Dot ok={Boolean(snapshot?.config.publicAppUrl)} />
                {snapshot?.config.publicAppUrl ? "Public URL set" : "Public URL not set"}
              </li>
              <li className="flex items-center gap-2">
                <Dot ok={(st?.imagesConfigured ?? 0) >= 3} />
                {st?.imagesConfigured ?? 0} of 4 public images linked
              </li>
              <li className="flex items-center gap-2">
                <Dot ok={Boolean(st?.aiEnabled)} />
                {st?.aiEnabled ? "AI language understanding on" : "Rules-based understanding (no AI key)"}
              </li>
            </ul>
            <button onClick={() => setShowSettings(true)} className="mt-3 text-[12.5px] font-semibold text-wb-primary underline">
              Edit settings
            </button>
          </section>
        </div>

        {/* B: phone */}
        <div className="md:col-start-2 md:row-span-2 md:row-start-1 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-1 lg:self-start">
          <PhoneSimulator conv={conv} statuses={statuses} interactive={convMode === "sim"} onSend={patientSends} assets={snapshot?.config.assets} />
          <p className="mt-3 text-center text-[11.5px] text-slate-400">
            {convMode === "live"
              ? "Mirror of the live RCS conversation — reply on the registered phone."
              : "Simulated RCS — tap cards and chips, or type a reply like “Thursday afternoon or Friday before noon”."}
          </p>
        </div>

        {/* C: side panels */}
        <div className="space-y-4 md:col-start-1 md:row-start-2 lg:col-start-3 lg:row-start-1">
          <Capabilities conv={conv} statuses={statuses} />
          <ActivityLog events={conv?.events ?? []} />
          <PrivacyNote />
        </div>
      </main>

      {showSettings && snapshot && (
        <SettingsSheet
          snapshot={snapshot}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => setSnapshot(s)}
        />
      )}
    </div>
  );
}
