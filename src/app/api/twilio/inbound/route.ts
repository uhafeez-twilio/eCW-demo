import { after } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { handleInbound } from "@/lib/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio inbound webhook (Messaging Service → "Send a webhook"). */
export const POST = withApiHandler(async (req) => {
  const form = await req.formData().catch(() => null);
  const get = (k: string) => (form?.get(k) ? String(form.get(k)) : "");
  const from = get("From");
  if (from) {
    const payload = get("ButtonPayload") || undefined;
    const text = get("Body") || get("ButtonText");
    after(() => handleInbound(from, { text, payload }));
  }
  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
});
