import { envCreds, twilioFetch } from "./twilio-http";

// Tiny JSON document store. Persistent through Twilio Sync (default service,
// using the deployment's own credentials) so webhooks work on serverless hosts;
// falls back to process memory if Sync is unreachable.

const g = globalThis as unknown as {
  __wbMem?: Map<string, unknown>;
  __wbSyncDownUntil?: number;
  __wbLocks?: Map<string, Promise<unknown>>;
};
const mem = (g.__wbMem ??= new Map<string, unknown>());
const locks = (g.__wbLocks ??= new Map<string, Promise<unknown>>());

const BASE = "https://sync.twilio.com/v1/Services/default/Documents";
const TTL = 60 * 60 * 24 * 7;

const syncUsable = () => Boolean(envCreds()) && Date.now() > (g.__wbSyncDownUntil ?? 0);
const markDown = () => {
  g.__wbSyncDownUntil = Date.now() + 30_000;
};

export async function getDoc<T>(name: string): Promise<T | null> {
  const c = envCreds();
  if (c && syncUsable()) {
    try {
      const r = await twilioFetch<{ data?: T }>(c, `${BASE}/${name}`);
      if (r.status === 404) {
        mem.delete(name);
        return null;
      }
      if (r.ok) {
        mem.set(name, r.data.data ?? null);
        return (r.data.data as T) ?? null;
      }
      markDown();
    } catch {
      markDown();
    }
  }
  return (mem.get(name) as T | undefined) ?? null;
}

export async function putDoc(name: string, data: unknown, opts: { ttl?: boolean } = {}): Promise<void> {
  mem.set(name, data);
  const c = envCreds();
  if (!c || !syncUsable()) return;
  const form: Record<string, string> = { Data: JSON.stringify(data) };
  if (opts.ttl !== false) form.Ttl = String(TTL);
  try {
    const upd = await twilioFetch(c, `${BASE}/${name}`, { method: "POST", form });
    if (upd.status === 404) {
      const created = await twilioFetch(c, BASE, { method: "POST", form: { ...form, UniqueName: name } });
      if (!created.ok && created.status !== 409) markDown();
    } else if (!upd.ok) {
      markDown();
    }
  } catch {
    markDown();
  }
}

export async function delDoc(name: string): Promise<void> {
  mem.delete(name);
  const c = envCreds();
  if (!c || !syncUsable()) return;
  try {
    await twilioFetch(c, `${BASE}/${name}`, { method: "DELETE" });
  } catch {
    markDown();
  }
}

/** Serialize work per key so rapid taps do not clobber each other. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

export const storageBackend = (): "sync" | "memory" => (syncUsable() ? "sync" : "memory");
