import twilio from "twilio";
import type { StoredConfig } from "./config";
import { getActive } from "./config";
import { logEvent, saveConv } from "./conv-store";
import { ensureTemplates, type TemplateSet } from "./templates";
import type { Creds } from "./twilio-http";
import type { Conversation, Msg, UiBlock } from "./types";

export type Outgoing =
  | { kind: "text"; text: string }
  | { kind: "template"; key: string; vars: Record<string, string>; ui: UiBlock };

export interface Session {
  conv: Conversation;
  creds: Creds | null;
  cfg: StoredConfig;
  templates?: TemplateSet;
}

export async function openSession(conv: Conversation): Promise<Session> {
  const { cfg, creds } = await getActive();
  return { conv, creds, cfg };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 10);

/**
 * RCS-only sends use `from: rcs:<agent>` and MUST use `to: rcs:+1…` (same channel).
 * Messaging Service sends use plain numbers and may fall back to SMS/MMS.
 */
function addressing(creds: Creds, phone: string): Record<string, string> {
  const useSender = Boolean(creds.senderId) && (creds.rcsOnly || !creds.messagingServiceSid);
  if (useSender) {
    const id = creds.senderId;
    return { to: `rcs:${phone}`, from: id.startsWith("rcs:") ? id : `rcs:${id}` };
  }
  return { to: phone, messagingServiceSid: creds.messagingServiceSid };
}

async function sendLive(s: Session, out: Outgoing): Promise<string> {
  const creds = s.creds;
  if (!creds) throw new Error("No Twilio credentials are configured. Open Settings and add them.");
  if (!creds.messagingServiceSid && !creds.senderId) {
    throw new Error("No RCS sender configured. Add your RCS Messaging Service SID (or RCS Sender ID) in Settings.");
  }
  const client = twilio(creds.username, creds.password, { accountSid: creds.accountSid });
  const params: Record<string, unknown> = { ...addressing(creds, s.conv.phone) };
  if (s.cfg.publicAppUrl) params.statusCallback = `${s.cfg.publicAppUrl}/api/twilio/status`;

  const attempt = async (force: boolean) => {
    if (out.kind === "text") {
      params.body = out.text;
    } else {
      if (!s.templates || force) s.templates = await ensureTemplates(creds, s.cfg, force);
      const sid = s.templates.sids[out.key];
      if (!sid) throw new Error(`Missing template "${out.key}"`);
      params.contentSid = sid;
      params.contentVariables = JSON.stringify(out.vars);
    }
    const msg = await client.messages.create(params as never);
    return msg.sid as string;
  };

  try {
    return await attempt(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (out.kind === "template" && /content/i.test(message) && /(not found|invalid|exist)/i.test(message)) {
      return await attempt(true);
    }
    throw err;
  }
}

/** Sends (or simulates) one outbound message and records it on the conversation. */
export async function deliver(s: Session, out: Outgoing): Promise<Msg> {
  const { conv } = s;
  const live = conv.mode === "live";
  conv.typing = true;
  await saveConv(conv);
  await sleep(live ? 450 : 750);

  let sid: string | undefined;
  try {
    sid = live ? await sendLive(s, out) : `SIM${rid()}`;
  } catch (err) {
    conv.typing = false;
    const message = err instanceof Error ? err.message : "Send failed";
    logEvent(conv, "warn", "Twilio send failed", message);
    await saveConv(conv);
    throw err;
  }

  const ui: UiBlock = out.kind === "text" ? { kind: "text", text: out.text } : out.ui;
  const msg: Msg = {
    id: rid(),
    dir: "out",
    ts: Date.now(),
    sid,
    channel: live ? "rcs" : "sim",
    ui,
  };
  conv.messages.push(msg);
  conv.typing = false;
  const label = out.kind === "text" ? "Text" : out.key.replace(/_/g, " ");
  logEvent(conv, "send", live ? `RCS sent · ${label}` : `Simulated · ${label}`, live ? sid : undefined);
  await saveConv(conv);
  return msg;
}
