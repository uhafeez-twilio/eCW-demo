import Link from "next/link";
import { WillowMark } from "@/components/willow-mark";

export const metadata = { title: "Setup guide · Willowbrook RCS demo" };

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Try it instantly in Simulator mode",
    body: (
      <p>
        On the home screen leave <b>Simulator</b> selected and press <b>Send simulated reminder</b>. Tap the cards and chips, or type
        free-text replies as the patient. No Twilio setup is required for this mode.
      </p>
    ),
  },
  {
    title: "Create an API key in your Twilio sandbox",
    body: (
      <p>
        Twilio Console → <b>Account → API keys &amp; tokens → Create API key</b>. Copy the <b>SID (SK…)</b> and <b>Secret</b>. You can
        also use your Account SID + Auth Token, but a revocable API key is safer.
      </p>
    ),
  },
  {
    title: "Add your RCS sender to a Messaging Service",
    body: (
      <p>
        In <b>Messaging → Services</b>, open (or create) a Messaging Service, then under <b>Sender Pool</b> add your RCS sender. Copy the
        service&apos;s <b>SID (MG…)</b>. Make sure your phone is registered as an RCS test device for the sender.
      </p>
    ),
  },
  {
    title: "Give the app a public URL",
    body: (
      <p>
        Twilio needs to reach this app. When deployed, use the deployment URL. In <b>Settings</b>, press <b>Use this site</b> next to
        Public app URL. (If the site is behind a login or deployment protection, Twilio can&apos;t reach it — use a public URL.)
      </p>
    ),
  },
  {
    title: "Host the card images",
    body: (
      <p>
        Download the PNGs from the <Link href="/assets" className="font-medium text-wb-primary underline">Assets page</Link>, upload
        them to any public location, and paste the URLs into <b>Settings → Public image URLs</b>.
      </p>
    ),
  },
  {
    title: "Enter your sandbox in Settings",
    body: (
      <p>
        Open <b>Settings</b>, choose <b>My sandbox</b>, paste the Account SID, API key and secret, and the Messaging Service SID. Press{" "}
        <b>Save settings</b>, then <b>Create RCS templates</b> and <b>Set inbound webhook</b>. The second button points the Messaging
        Service&apos;s incoming-message webhook at this app automatically.
      </p>
    ),
  },
  {
    title: "Go live",
    body: (
      <p>
        Switch to <b>Live RCS</b>, enter your registered test device number, and press <b>Send RCS reminder</b>. Tap
        <b> Reschedule</b> on your phone, then reply with something like <i>“Thursday afternoon or Friday before noon”</i>. The AI
        replies with matching times until you book one.
      </p>
    ),
  },
];

const ENV = [
  ["TWILIO_ACCOUNT_SID", "Account the app uses by default"],
  ["TWILIO_API_KEY / TWILIO_API_SECRET", "API key pair for that account"],
  ["TWILIO_RCS_MESSAGING_SERVICE_SID", "Messaging Service containing the RCS sender"],
  ["TWILIO_RCS_SENDER_ID", "Optional: rcs:<agent id> if not using a Messaging Service"],
  ["DEMO_TEST_DEVICE_NUMBER", "Pre-fills the registered test device"],
  ["DEMO_PUBLIC_APP_URL", "Public base URL of the deployed app"],
  ["ASSET_BANNER_URL, ASSET_CONFIRMED_URL, ASSET_SLOT_URL, ASSET_LOGO_URL", "Public image links"],
  ["OPENAI_API_KEY (optional) / OPENAI_MODEL", "Enables AI language understanding; otherwise built-in rules are used"],
  ["DEMO_CONFIG_SECRET (optional)", "Encrypts saved sandbox credentials"],
];

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-wb-sand/40">
      <header className="border-b border-wb-mint bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <WillowMark className="h-9 w-9" />
          <h1 className="mr-auto text-base font-semibold text-wb-ink">Setup guide</h1>
          <Link href="/" className="text-sm font-medium text-wb-primary hover:underline">
            ← Back to demo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <p className="text-[14px] leading-relaxed text-slate-600">
          Reproduce this demo in any Twilio sandbox in about ten minutes. Everything below is also available from the in-app{" "}
          <b>Settings</b> panel.
        </p>

        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-wb-primary text-sm font-semibold text-white">{i + 1}</span>
              <div className="min-w-0">
                <h2 className="text-[14.5px] font-semibold text-wb-ink">{s.title}</h2>
                <div className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-[14.5px] font-semibold text-wb-ink">Deployment settings (optional defaults)</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            When hosting your own copy, set these so the app works without touching Settings.
          </p>
          <dl className="mt-3 divide-y divide-slate-100">
            {ENV.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
                <dt className="break-words font-mono text-[12px] text-slate-800">{k}</dt>
                <dd className="text-[12.5px] text-slate-500">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl bg-wb-dark p-5 text-white">
          <h2 className="text-[14.5px] font-semibold">A note on HIPAA</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-white/75">
            This demo uses synthetic data and keeps message content to the minimum necessary. A production deployment needs a signed
            Business Associate Agreement and use of HIPAA-eligible Twilio products and configurations; confirm eligibility of each
            channel and service with Twilio before sending PHI.
          </p>
        </section>
      </main>
    </div>
  );
}
