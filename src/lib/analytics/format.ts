export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

const SHORT_DATE_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatShortDate(date: Date): string {
  return `${SHORT_DATE_MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// WooCommerce's revenue/stats interval `date_start` comes back as
// "YYYY-MM-DD HH:MM:SS" (or "YYYY-MM-DDTHH:MM:SS"), already in the store's
// own configured site timezone — parsed here via regex rather than
// `new Date(dateStr)` specifically to avoid reinterpreting it in whatever
// timezone the current server process happens to run in (see
// date-range.ts's resolveCustomRangeParams for the bug this class of
// mistake caused elsewhere). This is display-only: the string is never
// converted to an absolute instant, just read apart into digits.
function parseWcIntervalDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  const match = dateStr.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return {
    year: Number(year),
    month: Number(month) - 1,
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
}

export function formatWcIntervalLabel(
  dateStr: string,
  includeTime: boolean,
): string {
  const parsed = parseWcIntervalDate(dateStr);
  if (!parsed) return dateStr;
  const { year, month, day, hour, minute } = parsed;
  const datePart = `${SHORT_DATE_MONTH_NAMES[month]} ${day}, ${year}`;
  if (!includeTime) return datePart;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${datePart}, ${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// Same output shape as formatWcIntervalLabel ("Sep 2, 2026" / "Sep 2, 2026,
// 11:00 PM"), but for a bucket boundary this app computed itself (as an ISO
// instant string) rather than one WC returned — read via UTC getters since
// the instant is unambiguous, unlike formatWcIntervalLabel's regex parse of
// a bare, timezone-less WC date string.
export function formatUtcIntervalLabel(
  isoString: string,
  includeTime: boolean,
): string {
  const date = new Date(isoString);
  const datePart = `${SHORT_DATE_MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
  if (!includeTime) return datePart;
  const hour = date.getUTCHours();
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${datePart}, ${hour12}:${String(date.getUTCMinutes()).padStart(2, "0")} ${period}`;
}

export function dateToIsoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addIsoMonths(isoMonth: string, delta: number): string {
  const [year, month] = isoMonth.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const resultYear = Math.floor(total / 12);
  const resultMonth = (total % 12) + 1;
  return `${resultYear}-${String(resultMonth).padStart(2, "0")}`;
}

export function isoMonthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

export function formatIsoMonthLabel(isoMonth: string): string {
  const [year, month] = isoMonth.split("-").map(Number);
  return `${SHORT_DATE_MONTH_NAMES[month - 1]} ${year}`;
}

// Reuses parseWcIntervalDate's regex-based parsing (see its comment above)
// rather than `new Date(dateStr)`, for the same reason: dateStr is already
// in the store's own timezone with no offset, so re-parsing it with `Date`
// would reinterpret it in whatever timezone the server process runs in.
export function wcDateToIsoMonth(dateStr: string): string | null {
  const parsed = parseWcIntervalDate(dateStr);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month + 1).padStart(2, "0")}`;
}
