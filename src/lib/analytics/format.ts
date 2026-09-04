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
