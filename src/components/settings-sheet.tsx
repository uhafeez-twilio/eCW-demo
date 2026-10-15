"use client";

import { useState } from "react";
import { ASSET_FILES, type AssetKey } from "@/lib/brand";
import { api, suggestedPublicUrl, type ConfigSnapshot } from "@/lib/client-api";

interface Props {
  snapshot: ConfigSnapshot;
  onClose: () => void;
  onSaved: (s: ConfigSnapshot) => void;
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = true,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-wb-primary focus:ring-2 focus:ring-wb-primary/20 ${mono ? "font-mono" : ""}`}
      />
      {hint && <span className="mt-1 block text-[11px] leading-snug text-slate-400">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-slate-100 pb-5">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-wb-primary">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsSheet({ snapshot, onClose, onSaved }: Props) {
  const c = snapshot.config;
  const [useCustom, setUseCustom] = useState(c.useCustom);
  const [accountSid, setAccountSid] = useState(c.accountSid);
  const [authMode, setAuthMode] = useState(c.authMode);
  const [apiKeySid, setApiKeySid] = useState(c.apiKeySid);
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [msid, setMsid] = useState(c.messagingServiceSid);
  const [senderId, setSenderId] = useState(c.rcsSenderId);
  const [rcsOnly, setRcsOnly] = useState(c.rcsOnly);
  const [publicAppUrl, setPublicAppUrl] = useState(c.publicAppUrl);
  const [assets, setAssets] = useState<Record<AssetKey, string>>(c.assets);
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(): Promise<ConfigSnapshot> {
    const snap = await api<ConfigSnapshot>("/api/config", {
      method: "POST",
      body: JSON.stringify({
        useCustom,
        accountSid,
        authMode,
        apiKeySid,
        apiKeySecret,
        authToken,
        messagingServiceSid: msid,
        rcsSenderId: senderId,
        rcsOnly,
        publicAppUrl,
        assets,
      }),
    });
    setApiKeySecret("");
    setAuthToken("");
    onSaved(snap);
    return snap;
  }

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setNote(null);
    try {
      setNote({ ok: true, text: await fn() });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy("");
    }
  }

  const fillFromBase = () => {
    const b = baseUrl.trim().replace(/\/+$/, "");
    if (!b) return;
    setAssets(Object.fromEntries(ASSET_FILES.map((f) => [f.key, `${b}/${f.file}`])) as Record<AssetKey, string>);
  };

  const primaryBtn =
    "rounded-lg bg-wb-primary px-4 py-2 text-[13px] font-medium text-white transition enabled:hover:bg-wb-dark disabled:opacity-50";
  const ghostBtn =
    "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 transition enabled:hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-wb-ink">Demo settings</h2>
            <p className="text-xs text-slate-500">Point the demo at your own Twilio sandbox</p>
          </div>
          <button onClick={onClose} className="rounded-full px-2.5 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Close">
            ×
          </button>
        </header>

        <div className="wb-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <Section title="1 · Twilio account">
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, t: "Demo environment", d: "Credentials preset on this deployment" },
                { v: true, t: "My sandbox", d: "Use my own Twilio account" },
              ].map((o) => (
                <button
                  key={o.t}
                  type="button"
                  onClick={() => setUseCustom(o.v)}
                  className={`rounded-xl border p-3 text-left transition ${
                    useCustom === o.v ? "border-wb-primary bg-wb-mint/40 ring-2 ring-wb-primary/20" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="text-[13px] font-semibold text-slate-800">{o.t}</p>
                  <p className="text-[11px] leading-snug text-slate-500">{o.d}</p>
                </button>
              ))}
            </div>

            {useCustom && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                <Field label="Account SID" value={accountSid} onChange={setAccountSid} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                <div className="flex gap-2 text-xs">
                  {(["apiKey", "authToken"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAuthMode(m)}
                      className={`rounded-full px-3 py-1 font-medium ${authMode === m ? "bg-wb-primary text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
                    >
                      {m === "apiKey" ? "API Key + Secret (recommended)" : "Auth Token"}
                    </button>
                  ))}
                </div>
                {authMode === "apiKey" ? (
                  <>
                    <Field label="API Key SID" value={apiKeySid} onChange={setApiKeySid} placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                    <Field
                      label="API Key Secret"
                      type="password"
                      value={apiKeySecret}
                      onChange={setApiKeySecret}
                      placeholder={c.hasApiKeySecret ? "•••••••• saved — leave blank to keep" : "Paste secret"}
                    />
                  </>
                ) : (
                  <Field
                    label="Auth Token"
                    type="password"
                    value={authToken}
                    onChange={setAuthToken}
                    placeholder={c.hasAuthToken ? "•••••••• saved — leave blank to keep" : "Paste auth token"}
                  />
                )}
                <p className="text-[11px] leading-snug text-slate-400">
                  Stored encrypted on the server so the webhook can reply to your device. Use a sandbox account and a revocable API key.
                </p>
              </div>
            )}
          </Section>

          <Section title="2 · RCS sender">
            <Field
              label="Messaging Service SID (recommended)"
              value={msid}
              onChange={setMsid}
              placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              hint="The Messaging Service that contains your RCS sender."
            />
            <Field
              label="RCS Sender ID (optional alternative)"
              value={senderId}
              onChange={setSenderId}
              placeholder="rcs:willowbrook_agent"
              hint="Your RCS agent, e.g. rcs:your_agent_id. Used on its own when no Messaging Service SID is set."
            />
            <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-[12px] leading-snug text-slate-600">
              <input
                type="checkbox"
                checked={rcsOnly}
                onChange={(e) => setRcsOnly(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#1f6f5f]"
              />
              <span>
                <b>RCS only (no SMS fallback).</b> Sends straight from the RCS Sender ID so a failure shows up instead of silently
                falling back to SMS. Turn off to send through the Messaging Service instead.
              </span>
            </label>
          </Section>

          <Section title="3 · Public app URL & webhooks">
            <Field
              label="Public app URL"
              value={publicAppUrl}
              onChange={setPublicAppUrl}
              placeholder="https://your-app.example.com"
              hint="Twilio must be able to reach this URL. Used for inbound replies, receipts, calendar and check-in links."
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ghostBtn} onClick={() => setPublicAppUrl(suggestedPublicUrl())}>
                Use this site
              </button>
            </div>
            {publicAppUrl && (
              <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-[11.5px] text-slate-600">
                <p>
                  <b>Inbound webhook:</b> <code className="break-all">{publicAppUrl.replace(/\/+$/, "")}/api/twilio/inbound</code>
                </p>
                <p>
                  <b>Status callback:</b> <code className="break-all">{publicAppUrl.replace(/\/+$/, "")}/api/twilio/status</code>
                </p>
              </div>
            )}
          </Section>

          <Section title="4 · Public image URLs">
            <p className="text-[11.5px] leading-snug text-slate-500">
              RCS cards need publicly reachable images. Download them from the <a href="/assets" className="font-medium text-wb-primary underline">Assets page</a>, host them, and paste the links.
            </p>
            <div className="flex gap-2">
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://cdn.example.com/willowbrook"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-[12px] outline-none focus:border-wb-primary"
              />
              <button type="button" className={ghostBtn} onClick={fillFromBase}>
                Fill all
              </button>
            </div>
            {ASSET_FILES.map((f) => (
              <Field
                key={f.key}
                label={`${f.file}`}
                hint={f.usedIn}
                value={assets[f.key]}
                onChange={(v) => setAssets((a) => ({ ...a, [f.key]: v }))}
                placeholder="https://…"
              />
            ))}
          </Section>

          <Section title="5 · Set up Twilio">
            <div className="flex flex-wrap gap-2">
              <button
                className={primaryBtn}
                disabled={Boolean(busy)}
                onClick={() =>
                  run("save", async () => {
                    await save();
                    return "Settings saved.";
                  })
                }
              >
                {busy === "save" ? "Saving…" : "Save settings"}
              </button>
              <button
                className={ghostBtn}
                disabled={Boolean(busy)}
                onClick={() =>
                  run("tpl", async () => {
                    await save();
                    const r = await api<{ message: string }>("/api/setup/templates", { method: "POST", body: JSON.stringify({ force: true }) });
                    return r.message;
                  })
                }
              >
                {busy === "tpl" ? "Creating…" : "Create RCS templates"}
              </button>
              <button
                className={ghostBtn}
                disabled={Boolean(busy)}
                onClick={() =>
                  run("hook", async () => {
                    await save();
                    const r = await api<{ message: string }>("/api/setup/webhook", { method: "POST", body: "{}" });
                    return r.message;
                  })
                }
              >
                {busy === "hook" ? "Updating…" : "Set inbound webhook"}
              </button>
            </div>
            <p className="text-[11px] leading-snug text-slate-400">
              Templates are also created automatically on the first live send. Re-run after changing image URLs.
            </p>
            {note && (
              <p className={`rounded-lg px-3 py-2 text-[12.5px] leading-snug ${note.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                {note.text}
              </p>
            )}
            {c.accountSid && (
              <button
                className="text-[12px] font-medium text-rose-600 underline"
                onClick={() =>
                  run("clear", async () => {
                    const snap = await api<ConfigSnapshot>("/api/config", { method: "DELETE" });
                    onSaved(snap);
                    setUseCustom(false);
                    setAccountSid("");
                    setApiKeySid("");
                    return "Saved sandbox credentials removed.";
                  })
                }
              >
                Remove saved sandbox credentials
              </button>
            )}
          </Section>
        </div>
      </aside>
    </div>
  );
}
