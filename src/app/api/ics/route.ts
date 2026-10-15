import { withApiHandler } from "@/lib/api-handler";
import { BRAND } from "@/lib/brand";
import { buildIcs } from "@/lib/slots";
import { readToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (req) => {
  const data = readToken(new URL(req.url).searchParams.get("t"));
  if (!data) return new Response("Invalid or expired link", { status: 400 });
  const ics = buildIcs({
    date: data.d,
    time: data.t,
    summary: `${BRAND.clinicName} – ${data.ty}`,
    description: `Appointment with ${data.p}. Scheduled via ${BRAND.clinicName}.`,
    location: `${BRAND.clinicName}, ${BRAND.address}`,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="willowbrook-appointment.ics"',
    },
  });
});
