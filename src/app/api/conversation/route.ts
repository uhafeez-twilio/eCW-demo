import { withApiHandler } from "@/lib/api-handler";
import { deleteConv, loadConv, loadStatuses } from "@/lib/conv-store";
import { convKey, isPlausiblePhone } from "@/lib/phone";
import { withLock } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (req) => {
  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  if (!isPlausiblePhone(phone)) return Response.json({ conv: null, statuses: {} });
  const key = convKey(phone);
  const [conv, statuses] = await Promise.all([loadConv(key), loadStatuses(key)]);
  return Response.json({ conv, statuses });
});

export const DELETE = withApiHandler(async (req) => {
  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  if (!isPlausiblePhone(phone)) return Response.json({ ok: false }, { status: 400 });
  const key = convKey(phone);
  await withLock(key, () => deleteConv(key));
  return Response.json({ ok: true });
});
