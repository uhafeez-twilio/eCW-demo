import type { Appt } from "./types";
import { parseSlotId, slotId } from "./slots";

export interface TokenData {
  d: string; // date
  t: string; // time
  ty: string; // appointment type
  p: string; // provider
  n: string; // first name
}

export function makeToken(a: Appt, firstName: string): string {
  return Buffer.from(
    JSON.stringify({ d: a.date, t: a.time, ty: a.type, p: a.provider, n: firstName }),
  ).toString("base64url");
}

export function readToken(t: string | null | undefined): TokenData | null {
  if (!t) return null;
  try {
    const j = JSON.parse(Buffer.from(t, "base64url").toString("utf8")) as TokenData;
    if (!parseSlotId(slotId(j.d, j.t))) return null;
    return j;
  } catch {
    return null;
  }
}
