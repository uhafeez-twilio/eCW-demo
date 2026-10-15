import { withApiHandler } from "@/lib/api-handler";
import { getActive } from "@/lib/config";
import { ensureTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Creates (or refreshes) the RCS Content Templates in the active Twilio account. */
export const POST = withApiHandler(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const { cfg, creds } = await getActive();
  if (!creds) {
    return Response.json({ error: "No Twilio credentials found. Add them in Settings first." }, { status: 400 });
  }
  try {
    const set = await ensureTemplates(creds, cfg, Boolean(body.force));
    return Response.json({
      ok: true,
      created: set.created,
      templates: Object.keys(set.sids).length,
      message:
        set.created > 0
          ? `Created ${set.created} RCS content templates in ${creds.accountSid}.`
          : "Templates are already up to date.",
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Template creation failed" }, { status: 502 });
  }
});
