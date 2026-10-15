import { getDoc, putDoc, delDoc } from "./store";
import type { Conversation, EventItem, EventTone } from "./types";

const name = (key: string) => `wb_conv_${key}`;
const statusName = (key: string) => `wb_st_${key}`;
const MAX_CHARS = 14000;

export const loadConv = (key: string) => getDoc<Conversation>(name(key));

export async function saveConv(conv: Conversation): Promise<void> {
  conv.updatedAt = Date.now();
  if (conv.events.length > 60) conv.events = conv.events.slice(-60);
  let json = JSON.stringify(conv);
  while (json.length > MAX_CHARS && conv.messages.length > 6) {
    conv.messages.shift();
    json = JSON.stringify(conv);
  }
  while (json.length > MAX_CHARS && conv.events.length > 10) {
    conv.events.shift();
    json = JSON.stringify(conv);
  }
  await putDoc(name(conv.key), conv);
}

export async function deleteConv(key: string): Promise<void> {
  await Promise.all([delDoc(name(key)), delDoc(statusName(key))]);
}

export const loadStatuses = async (key: string) =>
  (await getDoc<Record<string, string>>(statusName(key))) ?? {};

export async function setStatus(key: string, sid: string, status: string): Promise<void> {
  const cur = await loadStatuses(key);
  cur[sid] = status;
  const keys = Object.keys(cur);
  if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete cur[k];
  await putDoc(statusName(key), cur);
}

export function logEvent(conv: Conversation, tone: EventTone, title: string, detail?: string): void {
  const e: EventItem = { ts: Date.now(), tone, title, detail: detail?.slice(0, 280) };
  conv.events.push(e);
}
