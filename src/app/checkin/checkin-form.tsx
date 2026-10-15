"use client";

import { useState } from "react";

const ITEMS = [
  "Photo ID and insurance card on file",
  "Updated medication list reviewed",
  "Consent to receive text updates",
];

export function CheckinForm() {
  const [checked, setChecked] = useState<boolean[]>(ITEMS.map(() => false));
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-2xl bg-wb-mint/50 p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-wb-primary text-2xl text-white">✓</div>
        <p className="mt-3 text-base font-semibold text-wb-ink">You&apos;re checked in!</p>
        <p className="mt-1 text-sm text-slate-600">Just arrive a few minutes early. We&apos;ll take it from here.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
      className="space-y-3"
    >
      {ITEMS.map((item, i) => (
        <label key={item} className="flex items-start gap-3 rounded-xl bg-white p-3.5 text-sm text-slate-700 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={checked[i]}
            onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
            className="mt-0.5 h-4 w-4 accent-[#1f6f5f]"
          />
          {item}
        </label>
      ))}
      <button
        type="submit"
        disabled={!checked.every(Boolean)}
        className="w-full rounded-xl bg-wb-primary py-3 text-sm font-semibold text-white transition enabled:hover:bg-wb-dark disabled:opacity-40"
      >
        Complete check-in
      </button>
      <p className="text-center text-[11px] text-slate-400">Demo page · no data is collected or stored.</p>
    </form>
  );
}
