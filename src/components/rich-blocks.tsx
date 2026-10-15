"use client";

import { LOCAL_ASSETS } from "@/lib/brand";
import type { UiAction, UiBlock } from "@/lib/types";

interface Props {
  block: UiBlock;
  active: boolean; // reply actions can be tapped
  onAction: (a: UiAction) => void;
  assets?: Partial<Record<keyof typeof LOCAL_ASSETS, string>>;
}

function ActionRow({ a, active, onAction }: { a: UiAction; active: boolean; onAction: (a: UiAction) => void }) {
  const isReply = a.kind === "reply";
  const disabled = isReply && !active;
  const icon = a.kind === "url" ? (a.webview ? "▭" : "↗") : a.kind === "phone" ? "☎" : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAction(a)}
      className={`flex w-full items-center justify-center gap-1.5 border-t border-slate-200 px-3 py-2.5 text-[13px] font-medium transition ${
        disabled ? "cursor-default text-slate-400" : "text-wb-primary hover:bg-wb-mint/40 active:bg-wb-mint/70"
      }`}
    >
      {icon && <span className="text-xs opacity-80">{icon}</span>}
      {a.label}
    </button>
  );
}

function Pill({ a, active, onAction }: { a: UiAction; active: boolean; onAction: (a: UiAction) => void }) {
  const disabled = a.kind === "reply" && !active;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAction(a)}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
        disabled
          ? "cursor-default border-slate-200 bg-white/60 text-slate-400"
          : "border-wb-primary/40 bg-white text-wb-primary shadow-sm hover:bg-wb-mint/50 active:scale-95"
      }`}
    >
      {a.label}
    </button>
  );
}

function Media({ k, assets }: { k?: keyof typeof LOCAL_ASSETS; assets?: Props["assets"] }) {
  if (!k) return null;
  const configured = assets?.[k]?.trim();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={configured || "local"}
      src={configured || LOCAL_ASSETS[k]}
      alt=""
      className="aspect-[2/1] w-full object-cover"
      onError={(e) => {
        const el = e.currentTarget;
        if (!el.src.endsWith(LOCAL_ASSETS[k])) el.src = LOCAL_ASSETS[k];
      }}
    />
  );
}

export function RichBlock({ block, active, onAction, assets }: Props) {
  if (block.kind === "reply") {
    return (
      <div className="wb-pop ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-wb-primary px-3.5 py-2 text-[14px] leading-snug text-white shadow-sm">
        {block.viaButton && <span className="mr-1 text-[11px] opacity-70">tapped</span>}
        {block.text}
      </div>
    );
  }

  if (block.kind === "text") {
    return (
      <div className="wb-pop max-w-[82%] whitespace-pre-line rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[14px] leading-snug text-slate-800 shadow-sm ring-1 ring-slate-200">
        {block.text}
      </div>
    );
  }

  if (block.kind === "card") {
    return (
      <div className="wb-pop w-[268px] max-w-[88%] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <Media k={block.mediaKey} assets={assets} />
        <div className="px-3.5 pb-3 pt-3">
          {block.title && <p className="text-[14.5px] font-semibold leading-tight text-slate-900">{block.title}</p>}
          <p className="mt-1 whitespace-pre-line text-[13px] leading-snug text-slate-600">{block.body}</p>
        </div>
        {block.actions.map((a) => (
          <ActionRow key={a.label} a={a} active={active} onAction={onAction} />
        ))}
      </div>
    );
  }

  if (block.kind === "carousel") {
    return (
      <div className="wb-pop wb-scroll -mx-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3 pb-1">
        {block.cards.map((c) => (
          <div key={c.title + c.body} className="w-[210px] shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <Media k={c.mediaKey} assets={assets} />
            <div className="px-3 pb-2.5 pt-2.5">
              <p className="text-[14px] font-semibold leading-tight text-slate-900">{c.title}</p>
              <p className="mt-0.5 text-[12.5px] text-slate-600">{c.body}</p>
            </div>
            {c.actions.map((a) => (
              <ActionRow key={a.label} a={a} active={active} onAction={onAction} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // chips
  return (
    <div className="wb-pop flex max-w-[92%] flex-col gap-2">
      <div className="max-w-[88%] whitespace-pre-line rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[14px] leading-snug text-slate-800 shadow-sm ring-1 ring-slate-200">
        {block.body}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {block.chips.map((c) => (
          <Pill key={c.label} a={c} active={active} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}
