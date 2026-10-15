export interface Creds {
  source: "env" | "custom";
  accountSid: string;
  username: string;
  password: string;
  messagingServiceSid: string;
  senderId: string;
  rcsOnly: boolean;
}

export interface TwilioResponse<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
}

export function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function twilioFetch<T = Record<string, unknown>>(
  creds: Pick<Creds, "username" | "password">,
  url: string,
  opts: { method?: string; form?: Record<string, string | undefined>; json?: unknown } = {},
): Promise<TwilioResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: basicAuth(creds.username, creds.password),
    Accept: "application/json",
  };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.form)) if (v !== undefined) p.set(k, v);
    body = p.toString();
  }
  const res = await fetch(url, { method: opts.method ?? "GET", headers, body, cache: "no-store" });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

export function twilioErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as { message?: string; code?: number };
    if (d.message) return d.code ? `${d.message} (Twilio error ${d.code})` : d.message;
  }
  return fallback;
}

/** Credentials from the deployment environment (API key + secret preferred). */
export function envCreds(): Creds | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const key = process.env.TWILIO_API_KEY;
  const secret = process.env.TWILIO_API_SECRET;
  if (!accountSid || !key || !secret) return null;
  return {
    source: "env",
    accountSid,
    username: key,
    password: secret,
    messagingServiceSid: process.env.TWILIO_RCS_MESSAGING_SERVICE_SID ?? "",
    senderId: process.env.TWILIO_RCS_SENDER_ID ?? "",
    rcsOnly: false,
  };
}
