# MEMORY

## Willowbrook RCS Appointment Assistant (GTM Demo Test 4)
- Next.js app (custom backend; `/server` voice agent unused). Brand theme in `src/app/globals.css` (`--color-wb-*`) + `src/lib/brand.ts`. User will send real logo/banner later → re-theme (also regenerate `public/brand/*.png` via `npm run brand:images`, script in `scripts/`, uses sharp devDep).
- Flow: `src/lib/bot.ts` (reminder → confirm/reschedule → carousel slots → free-text NLU → book). NLU: `nlu.ts` (OpenAI json, `OPENAI_MODEL`) with `rules-nlu.ts` fallback. Fake availability `slots.ts` (Mon–Fri 8–5 America/Chicago, deterministic).
- State: Twilio Sync *default* service docs (`wb_conv_<digits>`, `wb_st_<digits>` receipts, `wb_config` AES-GCM encrypted settings, `wb_tpl_<AC>` template SIDs) via env API key; memory fallback (`store.ts`).
- Templates (Content API, created lazily or via Settings): reminder, confirmed (calendar + webview check-in), slots_2/3/4 carousels, chips_confirm/reschedule/after_slots/single; every one has twilio/text SMS fallback. Verified creation works (probe + cleanup done).
- Routes: /api/config, /api/reminder, /api/simulate, /api/conversation, /api/twilio/inbound (uses `after()`), /api/twilio/status, /api/setup/templates|webhook, /api/ics. Pages: /, /setup, /assets, /checkin (webview).
- Modes: Simulator (no Twilio) vs Live RCS. Custom sandbox creds in Settings (API key or auth token) stored encrypted server-side.
- Env vars registered (blank): TWILIO_RCS_MESSAGING_SERVICE_SID, TWILIO_RCS_SENDER_ID, DEMO_TEST_DEVICE_NUMBER, DEMO_PUBLIC_APP_URL, ASSET_*_URL (4), DEMO_CONFIG_SECRET; OPENAI_MODEL=gpt-4o-mini.
- Preview public paths work at `/public/twilio/api/...` (used for testing); for Twilio webhooks set Public app URL to `<origin>/public/twilio` in preview.
- Lint rule `react-hooks/set-state-in-effect` is strict: defer setState (setTimeout/promise callbacks).
