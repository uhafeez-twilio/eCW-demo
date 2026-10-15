import { withApiHandler } from "@/lib/api-handler";
import { setStatus } from "@/lib/conv-store";
import { convKey } from "@/lib/phone";
import { withLock } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Delivery / read receipts from Twilio. */
export const POST = withApiHandler(async (req) => {
  const form = await req.formData().catch(() => null);
  const sid = form?.get("MessageSid") ?? form?.get("SmsSid");
  const status = form?.get("MessageStatus") ?? form?.get("SmsStatus");
  const to = form?.get("To");
  const errorCode = form?.get("ErrorCode");
  if (sid && status && to) {
    const key = convKey(String(to));
    const value = errorCode ? `${String(status)}:${String(errorCode)}` : String(status);
    await withLock(`st_${key}`, () => setStatus(key, String(sid), value));
  }
  return new Response(null, { status: 204 });
});
