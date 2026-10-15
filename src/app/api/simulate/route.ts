import { after } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { handleInbound } from "@/lib/bot";
import { loadConv } from "@/lib/conv-store";
import { convKey } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Simulator: acts as the patient's phone (button taps and typed replies). */
export const POST = withApiHandler(async (req) => {
  const body = (await req.json().catch(() => null)) as { phone?: string; text?: string; payload?: string } | null;
  if (!body?.phone) return Response.json({ error: "Missing phone" }, { status: 400 });
  const conv = await loadConv(convKey(body.phone));
  if (!conv) return Response.json({ error: "Send a reminder first." }, { status: 404 });
  if (conv.mode !== "sim") {
    return Response.json({ error: "This conversation is live — reply from the registered device." }, { status: 409 });
  }
  const input = { text: body.text ?? "", payload: body.payload };
  after(() => handleInbound(body.phone as string, input));
  return Response.json({ accepted: true }, { status: 202 });
});
