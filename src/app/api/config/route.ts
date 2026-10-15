import { withApiHandler } from "@/lib/api-handler";
import { clearCustomSecrets, getActive, loadConfig, saveConfig, senderReady, toPublic, type StoredConfig } from "@/lib/config";
import { aiEnabled } from "@/lib/nlu";
import { storageBackend } from "@/lib/store";

export const dynamic = "force-dynamic";

async function snapshot() {
  const { cfg, creds } = await getActive();
  const base = cfg.publicAppUrl;
  return {
    config: toPublic(cfg),
    defaultPhone: process.env.DEMO_TEST_DEVICE_NUMBER ?? "",
    status: {
      credsSource: creds ? creds.source : "none",
      credsReady: Boolean(creds),
      accountSid: creds ? `${creds.accountSid.slice(0, 6)}…${creds.accountSid.slice(-4)}` : "",
      senderReady: senderReady(creds),
      aiEnabled: aiEnabled(),
      storage: storageBackend(),
      imagesConfigured: Object.values(cfg.assets).filter(Boolean).length,
    },
    webhooks: {
      inbound: base ? `${base}/api/twilio/inbound` : "",
      status: base ? `${base}/api/twilio/status` : "",
    },
  };
}

export const GET = withApiHandler(async () => Response.json(await snapshot()));

export const POST = withApiHandler(async (req) => {
  const body = (await req.json().catch(() => null)) as Partial<StoredConfig> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid body" }, { status: 400 });
  if (body.publicAppUrl && !/^https?:\/\//i.test(body.publicAppUrl)) {
    return Response.json({ error: "Public app URL must start with https://" }, { status: 400 });
  }
  const current = await loadConfig();
  const wantsCustom = body.useCustom ?? current.useCustom;
  if (wantsCustom) {
    const sid = body.accountSid ?? current.accountSid;
    if (sid && !/^AC[a-zA-Z0-9]{32}$/.test(sid.trim())) {
      return Response.json({ error: "Account SID should start with AC and be 34 characters." }, { status: 400 });
    }
  }
  await saveConfig(body);
  return Response.json(await snapshot());
});

export const DELETE = withApiHandler(async () => {
  await clearCustomSecrets();
  return Response.json(await snapshot());
});
