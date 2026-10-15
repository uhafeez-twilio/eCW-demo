import { withApiHandler } from "@/lib/api-handler";
import { getActive } from "@/lib/config";
import { twilioErrorMessage, twilioFetch } from "@/lib/twilio-http";

export const dynamic = "force-dynamic";

/** Points the Messaging Service's inbound webhook (and delivery callback) at this app. */
export const POST = withApiHandler(async () => {
  const { cfg, creds } = await getActive();
  if (!creds) return Response.json({ error: "Add Twilio credentials in Settings first." }, { status: 400 });
  if (!creds.messagingServiceSid) {
    return Response.json({ error: "Enter your RCS Messaging Service SID (MG…) in Settings first." }, { status: 400 });
  }
  if (!cfg.publicAppUrl) {
    return Response.json({ error: "Set the Public app URL in Settings first." }, { status: 400 });
  }
  const r = await twilioFetch(creds, `https://messaging.twilio.com/v1/Services/${creds.messagingServiceSid}`, {
    method: "POST",
    form: {
      InboundRequestUrl: `${cfg.publicAppUrl}/api/twilio/inbound`,
      InboundMethod: "POST",
      UseInboundWebhookOnNumber: "false",
      StatusCallback: `${cfg.publicAppUrl}/api/twilio/status`,
    },
  });
  if (!r.ok) {
    return Response.json({ error: twilioErrorMessage(r.data, "Could not update the Messaging Service") }, { status: 502 });
  }
  return Response.json({
    ok: true,
    message: `Inbound webhook set to ${cfg.publicAppUrl}/api/twilio/inbound on ${creds.messagingServiceSid}.`,
  });
});
