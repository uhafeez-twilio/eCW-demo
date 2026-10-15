/**
 * RCS needs a DIRECT link to an image file (JPEG/PNG/GIF). Pages such as
 * github.com/<user>/<repo>/blob/... return HTML, which Twilio rejects with error 63021.
 */
export function normalizeImageUrl(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.hostname === "github.com" || u.hostname === "www.github.com") {
      // github.com/<user>/<repo>/blob/<ref>/<path>  ->  raw.githubusercontent.com/<user>/<repo>/<ref>/<path>
      // github.com/<user>/<repo>/raw/<ref>/<path>   ->  same
      const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
      if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    }
    if (u.hostname === "www.dropbox.com" || u.hostname === "dropbox.com") {
      u.hostname = "dl.dropboxusercontent.com";
      u.searchParams.delete("dl");
      return u.toString();
    }
    return u.toString() === raw || raw.endsWith("/") ? raw : u.toString();
  } catch {
    return raw;
  }
}

export interface ImageCheck {
  url: string;
  ok: boolean;
  message: string;
}

const MAX_BYTES = 2 * 1024 * 1024;

export async function checkImageUrl(url: string): Promise<ImageCheck> {
  if (!url) return { url, ok: true, message: "not set" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", cache: "no-store" });
    if (!res.ok) return { url, ok: false, message: `The link returned HTTP ${res.status}.` };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!/^image\/(jpeg|jpg|png|gif)/.test(type)) {
      return {
        url,
        ok: false,
        message: `The link returns "${type || "unknown"}", not an image file. Use a direct link to the .jpg/.png file (for GitHub, the raw.githubusercontent.com link).`,
      };
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return { url, ok: false, message: "The image is larger than 2 MB." };
    return { url, ok: true, message: "ok" };
  } catch {
    return { url, ok: false, message: "The link could not be reached." };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkImages(urls: Record<string, string>): Promise<Record<string, ImageCheck>> {
  const entries = await Promise.all(
    Object.entries(urls)
      .filter(([, v]) => v)
      .map(async ([k, v]) => [k, await checkImageUrl(v)] as const),
  );
  return Object.fromEntries(entries);
}
