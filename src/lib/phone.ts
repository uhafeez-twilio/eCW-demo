export const digitsOnly = (s: string): string => s.replace(/\D/g, "");

export function toE164(input: string): string {
  const raw = input.replace(/^(rcs|whatsapp|sms):/i, "").trim();
  const d = digitsOnly(raw);
  if (!d) return "";
  if (raw.startsWith("+")) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

export const convKey = (input: string): string => digitsOnly(toE164(input));

export const isPlausiblePhone = (input: string): boolean => {
  const d = digitsOnly(input);
  return d.length >= 10 && d.length <= 15;
};
