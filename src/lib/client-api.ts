import type { PublicConfig } from "@/lib/config";

export interface ConfigSnapshot {
  config: PublicConfig;
  defaultPhone: string;
  status: {
    credsSource: "env" | "custom" | "none";
    credsReady: boolean;
    accountSid: string;
    senderReady: boolean;
    aiEnabled: boolean;
    storage: "sync" | "memory";
    imagesConfigured: number;
  };
  webhooks: { inbound: string; status: string };
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** Public base URL that Twilio (and a phone) can reach, based on where the app is running. */
export function suggestedPublicUrl(): string {
  if (typeof window === "undefined") return "";
  const preview = process.env.NEXT_PUBLIC_IS_MICROVM_PREVIEW === "true";
  return `${window.location.origin}${preview ? "/public/twilio" : ""}`;
}
