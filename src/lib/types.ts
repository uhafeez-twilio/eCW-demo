import type { AssetKey } from "./brand";

export type DeliveryMode = "live" | "sim";

export interface Range {
  date: string; // YYYY-MM-DD (clinic local)
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface Appt {
  type: string;
  provider: string;
  date: string;
  time: string;
}

export interface UiAction {
  kind: "reply" | "url" | "phone";
  label: string;
  id?: string;
  href?: string;
  webview?: boolean;
}

export type UiBlock =
  | { kind: "text"; text: string }
  | {
      kind: "card";
      mediaKey?: AssetKey;
      title?: string;
      body: string;
      actions: UiAction[];
    }
  | {
      kind: "carousel";
      cards: {
        mediaKey?: AssetKey;
        title: string;
        body: string;
        actions: UiAction[];
      }[];
    }
  | { kind: "chips"; body: string; chips: UiAction[] }
  | { kind: "reply"; text: string; viaButton?: boolean };

export interface Msg {
  id: string;
  dir: "out" | "in";
  ts: number;
  sid?: string;
  channel?: "rcs" | "sim";
  ui: UiBlock;
}

export type EventTone = "info" | "ai" | "send" | "recv" | "warn" | "ok";

export interface EventItem {
  ts: number;
  tone: EventTone;
  title: string;
  detail?: string;
}

export type ConvStatus =
  | "reminded"
  | "rescheduling"
  | "confirmed"
  | "rescheduled"
  | "escalated";

export interface Conversation {
  key: string;
  phone: string;
  mode: DeliveryMode;
  firstName: string;
  status: ConvStatus;
  appt: Appt;
  original: Appt;
  offered: string[];
  seen: string[];
  lastRanges: Range[];
  typing: boolean;
  messages: Msg[];
  events: EventItem[];
  createdAt: number;
  updatedAt: number;
}

export type Intent =
  | "confirm"
  | "reschedule"
  | "select_slot"
  | "availability"
  | "more"
  | "keep"
  | "human"
  | "question"
  | "unknown";

export interface NluResult {
  intent: Intent;
  source: "ai" | "rules";
  slotIndex?: number;
  ranges?: Range[];
  ack?: string;
  reply?: string;
}
