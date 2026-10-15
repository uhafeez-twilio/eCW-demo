# Willowbrook Medical Clinic · RCS Appointment Assistant

An **eClinicalWorks × Twilio** demo for the healow conference (Nashville): a fictional clinic, Willowbrook Medical Clinic, sends a branded **RCS appointment reminder**. The patient can **confirm** or **reschedule**; an AI assistant understands plain-language availability ("Thursday afternoon or Friday before noon"), offers matching times in a carousel, and keeps going until the new appointment is booked.

## What it showcases

- Branded RCS rich card with clinic banner + Confirm / Reschedule / Call / Directions
- Suggested-reply chips and a swipeable carousel of appointment times
- Add-to-calendar (.ics) and an in-chat **webview** pre-visit check-in
- AI free-text understanding (OpenAI) with a built-in rules fallback
- Delivery / read receipts, automatic SMS fallback text on every template
- Simulator mode (no Twilio needed) and Live RCS mode (your sandbox + test device)

## Run it

```bash
npm install
npm run dev
```

Open the app. **Simulator** mode works immediately. For **Live RCS** open **Settings** (or `/setup`) and follow the guide.

## Reproducing in another Twilio sandbox

1. Create an API key (SK…) in the Twilio Console.
2. Add your RCS sender to a Messaging Service (MG…) and register your phone as a test device.
3. Deploy the app somewhere Twilio can reach (Vercel, Railway, etc.).
4. In **Settings**: choose *My sandbox*, enter Account SID + API key/secret + Messaging Service SID, press **Use this site** for the public URL, host the images from `/assets` and paste their URLs.
5. Press **Create RCS templates** and **Set inbound webhook**, switch to **Live RCS**, enter your test device number and send.

### Optional environment defaults

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET` | Default Twilio account (also used for Twilio Sync state storage) |
| `TWILIO_RCS_MESSAGING_SERVICE_SID` / `TWILIO_RCS_SENDER_ID` | RCS sender |
| `DEMO_TEST_DEVICE_NUMBER` | Pre-fills the registered test device |
| `DEMO_PUBLIC_APP_URL` | Public base URL of the deployment |
| `ASSET_BANNER_URL`, `ASSET_CONFIRMED_URL`, `ASSET_SLOT_URL`, `ASSET_LOGO_URL` | Public image links |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Enables AI understanding (rules fallback otherwise) |
| `DEMO_CONFIG_SECRET` | Encrypts saved sandbox credentials |

## How it works

- `src/lib/bot.ts` – conversation flow (reminder → confirm / reschedule → offer times → book)
- `src/lib/nlu.ts`, `src/lib/rules-nlu.ts` – AI + rules date/time understanding
- `src/lib/slots.ts` – fake clinic availability (Mon–Fri 8–5, Nashville time)
- `src/lib/templates.ts` – Twilio Content API templates (card, carousel, chips + SMS fallback)
- `src/lib/store.ts` – state kept in Twilio Sync (default service), memory fallback
- `src/app/api/twilio/inbound|status` – Twilio webhooks (replies and receipts)

## Branding

Colours live in `src/app/globals.css` (`--color-wb-*`), clinic details in `src/lib/brand.ts`. Regenerate the card images with `npm run brand:images` (writes `public/brand/*.png`).

## HIPAA note

Synthetic data only; message content is limited to first name, visit type and time. A production deployment requires a signed BAA and HIPAA-eligible Twilio products/configuration — confirm channel eligibility with Twilio.
