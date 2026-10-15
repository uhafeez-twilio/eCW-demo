// Generates the Willowbrook RCS images from the official clinic artwork.
// Source art lives in scripts/brand-source/{logo,banner}.jpeg
// Run with: npm run brand:images   ->  writes public/brand/*
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "scripts/brand-source");
const OUT = path.resolve(process.cwd(), "public/brand");

const C = { navy: "#252C50", teal: "#4E7F78", sage: "#8FA68A", mint: "#D7E6DF", white: "#FFFFFF" };
const W = 1440;
const H = 720;

const save = async (name, pipeline) => {
  const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(OUT, name), buf);
  console.log(`wrote public/brand/${name} (${Math.round(buf.length / 1024)} KB)`);
};

const saveJpg = async (name, pipeline) => {
  const buf = await pipeline.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  await writeFile(path.join(OUT, name), buf);
  console.log(`wrote public/brand/${name} (${Math.round(buf.length / 1024)} KB)`);
};

await mkdir(OUT, { recursive: true });

// ---------- logo (circle-cropped on white) ----------
const logoMeta = await sharp(path.join(SRC, "logo.jpeg")).metadata();
const L = logoMeta.width; // square source
const radius = Math.round(L * 0.4); // circle radius inside the artwork
const side = radius * 2;
const logoSquare = await sharp(path.join(SRC, "logo.jpeg"))
  .extract({ left: Math.round(L / 2 - radius), top: Math.round(L / 2 - radius), width: side, height: side })
  .resize(1024, 1024)
  .png()
  .toBuffer();
const circle = Buffer.from(`<svg width="1024" height="1024"><circle cx="512" cy="512" r="512" fill="#fff"/></svg>`);
const logoCircle = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#ffffff" } })
  .composite([{ input: logoSquare }, { input: circle, blend: "dest-in" }])
  .png()
  .toBuffer();
await save("willowbrook-logo.png", sharp(logoCircle).resize(512, 512));
await save("willowbrook-sender-logo-224.png", sharp(logoCircle).resize(224, 224));

// ---------- banner derived images ----------
const bannerPath = path.join(SRC, "banner.jpeg");
const bm = await sharp(bannerPath).metadata();
const cropW = Math.min(bm.width, bm.height * 2); // 2:1 crop at full height
const crop = (left) => sharp(bannerPath).extract({ left, top: 0, width: cropW, height: bm.height }).resize(W, H);

// RCS agent / sender banner (3.2:1)
await saveJpg("willowbrook-banner.jpg", sharp(bannerPath).resize(1440, 448, { fit: "cover" }));

// Reminder card: logo + name side of the banner
await saveJpg("willowbrook-reminder-banner.jpg", crop(0));

// Confirmed card: same side with a check badge
const badge = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="1270" cy="575" r="118" fill="#ffffff" opacity="0.55"/>
  <circle cx="1270" cy="575" r="92" fill="${C.teal}"/>
  <path d="M 1228 577 l 30 32 l 56 -66" stroke="#fff" stroke-width="17" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);
const confirmedBase = await crop(0).png().toBuffer();
await saveJpg("willowbrook-confirmed-banner.jpg", sharp(confirmedBase).composite([{ input: badge }]));

// Slot card: tagline / leaf side with a calendar badge
const cal = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(70 70)">
    <rect x="6" y="12" width="230" height="210" rx="26" fill="#000" opacity="0.12"/>
    <rect width="230" height="210" rx="26" fill="#fff"/>
    <path d="M0 62 V26 Q0 0 26 0 H204 Q230 0 230 26 V62 Z" fill="${C.teal}"/>
    <rect x="58" y="-14" width="14" height="36" rx="7" fill="${C.navy}"/>
    <rect x="158" y="-14" width="14" height="36" rx="7" fill="${C.navy}"/>
    ${[0, 1, 2]
      .flatMap((r) =>
        [0, 1, 2, 3].map(
          (c) =>
            `<rect x="${24 + c * 46}" y="${82 + r * 40}" width="34" height="28" rx="8" fill="${r === 1 && c === 2 ? C.teal : C.mint}"/>`,
        ),
      )
      .join("")}
  </g>
</svg>`);
const slotBase = await crop(bm.width - cropW).png().toBuffer();
await saveJpg("willowbrook-slot-card.jpg", sharp(slotBase).composite([{ input: cal }]));
