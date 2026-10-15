import { createHash } from "crypto";
import { BRAND } from "./brand";
import type { StoredConfig } from "./config";
import { getDoc, putDoc } from "./store";
import { twilioErrorMessage, twilioFetch, type Creds } from "./twilio-http";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

type Json = Record<string, unknown>;
interface Def {
  variables: Record<string, string>;
  types: Json;
}

const reply = (title: string, id: string) => ({ type: "QUICK_REPLY", title, id });
const url = (title: string, href: string, webview?: "FULL" | "HALF" | "TALL") => ({
  type: "URL",
  title,
  url: href,
  ...(webview ? { webview_size: webview } : {}),
});
const phone = (title: string) => ({ type: "PHONE_NUMBER", title, phone: BRAND.phone });

export const SLOT_COUNTS = [2, 3, 4] as const;

export function buildDefs(assets: StoredConfig["assets"], appUrl: string): Record<string, Def> {
  const media = (u: string) => (u ? { media: [u] } : {});
  const defs: Record<string, Def> = {};

  defs.reminder = {
    variables: { "1": `Hi Alex, this is ${BRAND.clinicName}. Reminder of your annual wellness visit.` },
    types: {
      "twilio/card": {
        title: "Appointment reminder",
        body: "{{1}}",
        height: "MEDIUM",
        ...media(assets.banner),
        actions: [
          reply("Confirm", "confirm"),
          reply("Reschedule", "reschedule"),
          phone("Call clinic"),
          url("Get directions", BRAND.mapsUrl),
        ],
      },
      "twilio/text": {
        body: `{{1}}\n\nReply CONFIRM to confirm or RESCHEDULE to pick a new time. Reply STOP to opt out.`,
      },
    },
  };

  const confirmedActions: Json[] = [];
  if (appUrl) {
    confirmedActions.push(url("Add to calendar", `${appUrl}/api/ics?t={{3}}`));
    confirmedActions.push(url("Pre-visit check-in", `${appUrl}/checkin?t={{3}}`, "TALL"));
  }
  confirmedActions.push(url("Get directions", BRAND.mapsUrl));
  confirmedActions.push(phone("Call clinic"));
  if (confirmedActions.length < 4) confirmedActions.push(reply("Reschedule", "reschedule"));
  defs.confirmed = {
    variables: { "1": "You're confirmed, Alex", "2": "Annual wellness visit\nThursday, June 12 at 2:30 PM", "3": "sample" },
    types: {
      "twilio/card": {
        title: "{{1}}",
        body: "{{2}}",
        height: "MEDIUM",
        ...media(assets.confirmed),
        actions: confirmedActions,
      },
      "twilio/text": { body: "{{1}}\n{{2}}\n\nReply RESCHEDULE to change this appointment." },
    },
  };

  for (const n of SLOT_COUNTS) {
    const variables: Record<string, string> = {};
    const cards: Json[] = [];
    const lines: string[] = [];
    for (let i = 1; i <= n; i++) {
      const a = 3 * i - 2;
      variables[String(a)] = "Thu, Jun 12";
      variables[String(a + 1)] = `2:30 PM · ${BRAND.provider}`;
      variables[String(a + 2)] = "20250612T1430";
      cards.push({
        title: `{{${a}}}`,
        body: `{{${a + 1}}}`,
        height: "MEDIUM",
        ...(assets.slot ? { media: assets.slot } : {}),
        actions: [reply("Book this time", `slot_{{${a + 2}}}`)],
      });
      lines.push(`${i}) {{${a}}} at {{${a + 1}}}`);
    }
    defs[`slots_${n}`] = {
      variables,
      types: {
        "twilio/carousel": { body: `Available times at ${BRAND.shortName}`, cards },
        "twilio/text": {
          body: `${lines.join("\n")}\n\nReply with a number to book, or tell me which days and times work for you.`,
        },
      },
    };
  }

  defs.chips_confirm = {
    variables: { "1": "Would you like to confirm your appointment or find another time?" },
    types: {
      "twilio/card": {
        body: "{{1}}",
        actions: [reply("Confirm", "confirm"), reply("Reschedule", "reschedule"), reply("Talk to staff", "human")],
      },
      "twilio/text": { body: "{{1}}\n\nReply CONFIRM, RESCHEDULE or STAFF." },
    },
  };

  defs.chips_reschedule = {
    variables: { "1": "Prefer something different? Tap a preference or type the days and times that work for you." },
    types: {
      "twilio/card": {
        body: "{{1}}",
        actions: [
          reply("Mornings", "pref_morning"),
          reply("Afternoons", "pref_afternoon"),
          reply("Next week", "pref_nextweek"),
          reply("Talk to staff", "human"),
        ],
      },
      "twilio/text": { body: "{{1}}" },
    },
  };

  defs.chips_after_slots = {
    variables: { "1": "Tap a time above, or reply with your own days and times." },
    types: {
      "twilio/card": {
        body: "{{1}}",
        actions: [
          reply("Show more times", "more"),
          reply("None of these work", "none"),
          reply("Keep current time", "keep"),
          reply("Talk to staff", "human"),
        ],
      },
      "twilio/text": { body: "{{1}}" },
    },
  };

  defs.chips_single = {
    variables: { "1": "I found one opening that fits.", "2": "20250612T1430" },
    types: {
      "twilio/card": {
        body: "{{1}}",
        actions: [reply("Book this time", "slot_{{2}}"), reply("Other times", "more"), reply("Keep current time", "keep")],
      },
      "twilio/text": { body: "{{1}}\n\nReply YES to book it, or tell me other days and times." },
    },
  };

  return defs;
}

export interface TemplateSet {
  fp: string;
  sids: Record<string, string>;
}

export async function ensureTemplates(
  creds: Creds,
  cfg: StoredConfig,
  force = false,
): Promise<TemplateSet & { created: number }> {
  const defs = buildDefs(cfg.assets, cfg.publicAppUrl);
  const fp = createHash("sha1").update(JSON.stringify(defs)).digest("hex").slice(0, 8);
  const docName = `wb_tpl_${creds.accountSid}`;
  const keys = Object.keys(defs);

  if (!force) {
    const stored = await getDoc<TemplateSet>(docName);
    if (stored && stored.fp === fp && keys.every((k) => stored.sids[k])) {
      return { ...stored, created: 0 };
    }
  }

  const entries = await Promise.all(
    keys.map(async (k) => {
      const r = await twilioFetch<{ sid?: string }>(creds, CONTENT_URL, {
        method: "POST",
        json: { friendly_name: `wb_${k}_${fp}`, language: "en", ...defs[k] },
      });
      if (!r.ok || !r.data.sid) {
        throw new Error(`Template "${k}": ${twilioErrorMessage(r.data, "could not be created")}`);
      }
      return [k, r.data.sid] as const;
    }),
  );
  const set: TemplateSet = { fp, sids: Object.fromEntries(entries) };
  await putDoc(docName, set, { ttl: false });
  return { ...set, created: entries.length };
}
