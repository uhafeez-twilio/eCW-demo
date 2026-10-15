"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND, type AssetKey } from "@/lib/brand";
import type { Conversation, UiAction } from "@/lib/types";
import { RichBlock } from "./rich-blocks";
import { WillowMark } from "./willow-mark";

interface Props {
  conv: Conversation | null;
  statuses: Record<string, string>;
  interactive: boolean;
  onSend: (input: { text: string; payload?: string }) => void;
  assets?: Partial<Record<AssetKey, string>>;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Sending…",
  accepted: "Sending…",
  sending: "Sending…",
  sent: "Sent",
  delivered: "Delivered ✓✓",
  read: "Read ✓✓",
  failed: "Failed to send",
  undelivered: "Not delivered",
};

export function PhoneSimulator({ conv, statuses, interactive, onSend, assets }: Props) {
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [webview, setWebview] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const msgs = conv?.messages ?? [];
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, conv?.typing]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const lastIn = msgs.map((m) => m.dir).lastIndexOf("in");
  const lastOut = msgs.map((m) => m.dir).lastIndexOf("out");
  const canTap = interactive && !conv?.typing;

  function handle(a: UiAction) {
    if (a.kind === "reply") {
      if (canTap) onSend({ text: a.label, payload: a.id });
    } else if (a.kind === "phone") {
      setToast(`Would dial ${BRAND.phoneDisplay}`);
    } else if (a.webview && a.href) {
      setWebview(a.href);
    } else if (a.href) {
      window.open(a.href, "_blank", "noopener,noreferrer");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canTap) return;
    setDraft("");
    onSend({ text });
  }

  const lastOutMsg = lastOut >= 0 ? msgs[lastOut] : undefined;
  const lastStatus = lastOutMsg?.sid ? statuses[lastOutMsg.sid] : undefined;

  return (
    <div className="mx-auto w-full max-w-[372px]">
      <div className="relative flex h-[min(700px,calc(100svh-7rem))] min-h-[560px] flex-col overflow-hidden rounded-[2.6rem] border-[10px] border-slate-900 bg-[#eef2ef] shadow-2xl shadow-wb-dark/30">
        <div className="absolute left-1/2 top-0 z-20 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900" />

        {/* header */}
        <div className="z-10 flex items-center gap-2.5 border-b border-slate-200 bg-white px-3 pb-2.5 pt-7">
          <span className="text-lg text-slate-500">‹</span>
          <WillowMark className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[14px] font-semibold text-slate-900">
              {BRAND.clinicName}
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-sky-500" fill="currentColor" aria-label="Verified business">
                <path d="M10 1.5l2.3 1.6 2.8-.1.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.1L10 18.5l-2.3-1.6-2.8.1-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.1z" />
                <path d="M6.8 10.2l2.2 2.2 4.2-4.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </p>
            <p className="truncate text-[11px] text-slate-500">Verified business · RCS</p>
          </div>
          <span className="text-slate-400">⋮</span>
        </div>

        {/* messages */}
        <div ref={scroller} className="wb-scroll relative flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
          {!conv && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <WillowMark className="h-16 w-16" />
              <p className="mt-3 text-[15px] font-semibold text-slate-800">{BRAND.clinicName}</p>
              <p className="text-xs text-slate-500">{BRAND.tagline}</p>
              <p className="mt-5 max-w-[220px] text-xs leading-relaxed text-slate-500">
                Press <b>Send RCS reminder</b> to start the conversation.
              </p>
            </div>
          )}
          {conv && (
            <p className="py-1 text-center text-[11px] text-slate-400">
              Today · {conv.mode === "live" ? "RCS chat" : "RCS chat (simulated)"}
            </p>
          )}
          {msgs.map((m, i) => (
            <div key={m.id} className="flex flex-col items-start">
              <RichBlock block={m.ui} active={canTap && i > lastIn && m.dir === "out"} onAction={handle} assets={assets} />
              {i === lastOut && conv?.mode === "live" && lastStatus && (
                <span className="mt-1 pl-1 text-[10.5px] text-slate-400">
                  {(() => {
                    const [st, code] = lastStatus.split(":");
                    return (STATUS_LABEL[st] ?? st) + (code ? ` (error ${code})` : "");
                  })()}
                </span>
              )}
            </div>
          ))}
          {conv?.typing && (
            <div className="wb-pop flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-sm ring-1 ring-slate-200">
              {[0, 1, 2].map((d) => (
                <span key={d} className="wb-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          )}
        </div>

        {/* composer */}
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!interactive || !conv}
            placeholder={
              !conv ? "RCS message" : interactive ? "Reply as the patient…" : "Reply from the registered phone"
            }
            className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-2 text-[13.5px] text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!interactive || !conv || !draft.trim()}
            className="grid h-9 w-9 place-items-center rounded-full bg-wb-primary text-white transition enabled:hover:bg-wb-dark disabled:opacity-40"
            aria-label="Send"
          >
            ➤
          </button>
        </form>

        {toast && (
          <div className="wb-pop absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-lg">
            {toast}
          </div>
        )}

        {webview && (
          <div className="absolute inset-x-0 bottom-0 top-16 z-30 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <p className="text-xs font-medium text-slate-600">{BRAND.shortName} · in-app webview</p>
              <button type="button" onClick={() => setWebview("")} className="rounded-full px-2 text-lg text-slate-500 hover:bg-slate-100">
                ×
              </button>
            </div>
            <iframe src={webview} title="Pre-visit check-in" className="w-full flex-1 border-0" />
          </div>
        )}
      </div>
    </div>
  );
}
