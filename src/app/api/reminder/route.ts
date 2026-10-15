import { withApiHandler } from "@/lib/api-handler";
import { APPOINTMENT_TYPES } from "@/lib/brand";
import { startReminder } from "@/lib/bot";
import { getActive, senderReady } from "@/lib/config";
import { isPlausiblePhone } from "@/lib/phone";
import type { DeliveryMode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withApiHandler(async (req) => {
  const body = (await req.json().catch(() => null)) as {
    phone?: string;
    firstName?: string;
    apptType?: string;
    mode?: DeliveryMode;
  } | null;
  if (!body) return Response.json({ error: "Invalid request" }, { status: 400 });

  const mode: DeliveryMode = body.mode === "live" ? "live" : "sim";
  const phone = (body.phone ?? "").trim();
  if (!isPlausiblePhone(phone)) {
    return Response.json({ error: "Enter a valid mobile number, e.g. +1 615 555 0123." }, { status: 400 });
  }
  if (mode === "live") {
    const { creds } = await getActive();
    if (!creds) {
      return Response.json({ error: "No Twilio credentials found. Open Settings and add your sandbox credentials." }, { status: 400 });
    }
    if (!senderReady(creds)) {
      return Response.json({ error: "Add your RCS Messaging Service SID (or RCS Sender ID) in Settings first." }, { status: 400 });
    }
  }
  const apptType = (APPOINTMENT_TYPES as readonly string[]).includes(body.apptType ?? "")
    ? (body.apptType as string)
    : APPOINTMENT_TYPES[0];

  try {
    const conv = await startReminder({
      phone,
      firstName: (body.firstName ?? "").slice(0, 30) || "Alex",
      apptType,
      mode,
    });
    return Response.json({ conv });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not send the reminder." }, { status: 502 });
  }
});
