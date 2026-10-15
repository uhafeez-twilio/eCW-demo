// Single source of truth for the fictional clinic's branding and details.
// To re-theme the demo, edit this file and the CSS variables in globals.css.

export const BRAND = {
  clinicName: "Willowbrook Medical Clinic",
  shortName: "Willowbrook",
  botName: "Willow",
  tagline: "Your health, naturally cared for.",
  address: "2140 Willow Creek Pkwy, Nashville, TN 37203",
  phone: "+16155550142",
  phoneDisplay: "(615) 555-0142",
  timezone: "America/Chicago",
  provider: "Dr. Sarah Mitchell",
  poweredBy: "eClinicalWorks",
  eventName: "healow Conference · Nashville",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("2140 Willow Creek Pkwy, Nashville, TN 37203"),
} as const;

export const APPOINTMENT_TYPES = [
  "annual wellness visit",
  "follow-up visit",
  "lab results review",
  "flu shot visit",
] as const;

// Local (public/) image paths used by the in-app phone simulator.
// The real RCS messages use the public URLs configured in Settings.
export const LOCAL_ASSETS = {
  banner: "/brand/willowbrook-reminder-banner.png",
  confirmed: "/brand/willowbrook-confirmed-banner.png",
  slot: "/brand/willowbrook-slot-card.png",
  logo: "/brand/willowbrook-logo.png",
} as const;

export type AssetKey = keyof typeof LOCAL_ASSETS;

export const ASSET_FILES: {
  key: AssetKey;
  file: string;
  size: string;
  usedIn: string;
}[] = [
  {
    key: "banner",
    file: "willowbrook-reminder-banner.jpg",
    size: "1440 × 720",
    usedIn: "Appointment reminder rich card",
  },
  {
    key: "confirmed",
    file: "willowbrook-confirmed-banner.png",
    size: "1440 × 720",
    usedIn: "Confirmed / rescheduled rich card",
  },
  {
    key: "slot",
    file: "willowbrook-slot-card.jpg",
    size: "1440 × 720",
    usedIn: "Each card in the appointment-times carousel",
  },
  {
    key: "logo",
    file: "willowbrook-logo.png",
    size: "512 × 512",
    usedIn: "Reference logo mark (RCS sender profile logo)",
  },
];
