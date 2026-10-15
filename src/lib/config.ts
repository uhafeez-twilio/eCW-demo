import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getDoc, putDoc } from "./store";
import { envCreds, type Creds } from "./twilio-http";
import type { AssetKey } from "./brand";

export interface StoredConfig {
  useCustom: boolean;
  accountSid: string;
  authMode: "apiKey" | "authToken";
  apiKeySid: string;
  apiKeySecret: string;
  authToken: string;
  messagingServiceSid: string;
  rcsSenderId: string;
  rcsOnly: boolean;
  publicAppUrl: string;
  assets: Record<AssetKey, string>;
}

export type PublicConfig = Omit<StoredConfig, "apiKeySecret" | "authToken"> & {
  hasApiKeySecret: boolean;
  hasAuthToken: boolean;
};

const DOC = "wb_config";
const SECRETS = ["apiKeySecret", "authToken"] as const;

function defaults(): StoredConfig {
  const e = process.env;
  return {
    useCustom: false,
    accountSid: "",
    authMode: "apiKey",
    apiKeySid: "",
    apiKeySecret: "",
    authToken: "",
    messagingServiceSid: e.TWILIO_RCS_MESSAGING_SERVICE_SID ?? "",
    rcsSenderId: e.TWILIO_RCS_SENDER_ID ?? "",
    rcsOnly: true,
    publicAppUrl: e.DEMO_PUBLIC_APP_URL ?? "",
    assets: {
      banner: e.ASSET_BANNER_URL ?? "",
      confirmed: e.ASSET_CONFIRMED_URL ?? "",
      slot: e.ASSET_SLOT_URL ?? "",
      logo: e.ASSET_LOGO_URL ?? "",
    },
  };
}

const keyBytes = () =>
  createHash("sha256")
    .update(process.env.DEMO_CONFIG_SECRET || process.env.TWILIO_API_SECRET || "willowbrook-demo-secret")
    .digest();

function encrypt(obj: unknown): { v: 1; d: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return { v: 1, d: Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64") };
}

function decrypt<T>(doc: { d: string }): T | null {
  try {
    const buf = Buffer.from(doc.d, "base64");
    const d = createDecipheriv("aes-256-gcm", keyBytes(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const out = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function loadConfig(): Promise<StoredConfig> {
  const def = defaults();
  const doc = await getDoc<{ v: number; d: string }>(DOC);
  const saved = doc ? decrypt<Partial<StoredConfig>>(doc) : null;
  if (!saved) return def;
  const pick = (a: string | undefined, b: string) => (a && a.trim() ? a.trim() : b);
  return {
    useCustom: Boolean(saved.useCustom),
    accountSid: saved.accountSid ?? "",
    authMode: saved.authMode === "authToken" ? "authToken" : "apiKey",
    apiKeySid: saved.apiKeySid ?? "",
    apiKeySecret: saved.apiKeySecret ?? "",
    authToken: saved.authToken ?? "",
    messagingServiceSid: pick(saved.messagingServiceSid, def.messagingServiceSid),
    rcsSenderId: pick(saved.rcsSenderId, def.rcsSenderId),
    rcsOnly: saved.rcsOnly === undefined ? def.rcsOnly : Boolean(saved.rcsOnly),
    publicAppUrl: pick(saved.publicAppUrl, def.publicAppUrl),
    assets: {
      banner: pick(saved.assets?.banner, def.assets.banner),
      confirmed: pick(saved.assets?.confirmed, def.assets.confirmed),
      slot: pick(saved.assets?.slot, def.assets.slot),
      logo: pick(saved.assets?.logo, def.assets.logo),
    },
  };
}

export async function saveConfig(patch: Partial<StoredConfig>): Promise<StoredConfig> {
  const current = await loadConfig();
  const next: StoredConfig = {
    ...current,
    ...patch,
    assets: { ...current.assets, ...(patch.assets ?? {}) },
  };
  for (const k of SECRETS) {
    const incoming = (patch as Record<string, unknown>)[k];
    if (typeof incoming !== "string" || !incoming.trim()) next[k] = current[k];
    else next[k] = incoming.trim();
  }
  for (const k of ["accountSid", "apiKeySid", "messagingServiceSid", "rcsSenderId", "publicAppUrl"] as const) {
    next[k] = (next[k] ?? "").trim();
  }
  next.publicAppUrl = next.publicAppUrl.replace(/\/+$/, "");
  await putDoc(DOC, encrypt(next), { ttl: false });
  return next;
}

export async function clearCustomSecrets(): Promise<StoredConfig> {
  const current = await loadConfig();
  const next: StoredConfig = {
    ...current,
    useCustom: false,
    accountSid: "",
    apiKeySid: "",
    apiKeySecret: "",
    authToken: "",
  };
  await putDoc(DOC, encrypt(next), { ttl: false });
  return next;
}

export function toPublic(cfg: StoredConfig): PublicConfig {
  const { apiKeySecret, authToken, ...rest } = cfg;
  return { ...rest, hasApiKeySecret: Boolean(apiKeySecret), hasAuthToken: Boolean(authToken) };
}

export function resolveCreds(cfg: StoredConfig): Creds | null {
  const sender = {
    messagingServiceSid: cfg.messagingServiceSid.trim(),
    senderId: cfg.rcsSenderId.trim(),
    rcsOnly: cfg.rcsOnly,
  };
  if (cfg.useCustom) {
    if (!cfg.accountSid) return null;
    if (cfg.authMode === "apiKey" && cfg.apiKeySid && cfg.apiKeySecret) {
      return { source: "custom", accountSid: cfg.accountSid, username: cfg.apiKeySid, password: cfg.apiKeySecret, ...sender };
    }
    if (cfg.authMode === "authToken" && cfg.authToken) {
      return { source: "custom", accountSid: cfg.accountSid, username: cfg.accountSid, password: cfg.authToken, ...sender };
    }
    return null;
  }
  const e = envCreds();
  return e ? { ...e, ...sender } : null;
}

export async function getActive(): Promise<{ cfg: StoredConfig; creds: Creds | null }> {
  const cfg = await loadConfig();
  return { cfg, creds: resolveCreds(cfg) };
}

export const senderReady = (c: Creds | null): boolean =>
  Boolean(c && (c.messagingServiceSid || c.senderId));
