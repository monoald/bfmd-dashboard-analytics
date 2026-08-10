# Custom Date Range Picker Design

## Goal

Add a "Custom" option to the dashboard's date filter (next to the existing
Today / Last 7 Days / Last 30 Days chips) that opens a picker with common
calendar presets (Yesterday, Month to date, Last month, Year to date, Last
year, Last 90 days) and a two-month calendar for picking an arbitrary
start/end date range — styled entirely with this app's existing dark-navy/
teal theme, not the reference screenshot's default look.

## Scope confirmed with the user

- The existing 3 chips (Today, Last 7 Days, Last 30 Days) are **unchanged**
  — this adds a 4th "Custom" chip, not a replacement.
- The Custom popup's sidebar presets are exactly: Yesterday, Month to date,
  Last month, Year to date, Last year, Last 90 days, plus "Custom range"
  (which reveals the calendar). No other Shopify-specific presets (Black
  Friday, Cyber Monday, Quarters) — those don't fit this store's data model.
- The calendar shows two months side by side, matching the reference
  screenshot's layout, with Cancel/Apply buttons.

## Data model changes

### `DateRangeKey`

Currently a closed union of 3 values in `src/lib/analytics/types.ts`:

```ts
export type DateRangeKey = "today" | "7d" | "30d";
```

Extend it with one key per new named preset, plus a `"custom"` key for
arbitrary ranges:

```ts
export type DateRangeKey =
  | "today"
  | "7d"
  | "30d"
  | "yesterday"
  | "mtd"
  | "last-month"
  | "ytd"
  | "last-year"
  | "90d"
  | "custom";
```

### `ResolvedDateRange`

The `interval` field grows a third value:

```ts
export interface ResolvedDateRange {
  key: DateRangeKey;
  interval: "hour" | "day" | "week";
  current: PeriodBounds;
  previous: PeriodBounds;
}
```

**Bucketing rule:** `interval` is `"hour"` only for `"today"`/`"yesterday"`,
`"week"` when the current period spans more than 60 days, `"day"`
otherwise. This keeps Last 90 days / Year to date / Last year / long custom
ranges readable (13, ~52, 52 buckets respectively, instead of 90-365 daily
points) while leaving every existing preset's behavior unchanged.

### `resolveDateRange`

`src/lib/analytics/date-range.ts`'s `resolveDateRange(key, now)` gains a
case per new named preset, each computing `current`/`previous` as a
same-length window pair (matching the existing today/7d/30d pattern: the
"previous" period is the equal-length window immediately before "current"):

| Key | Current period | Previous period |
|---|---|---|
| `yesterday` | The single calendar day before `now` | The day before that |
| `mtd` | 1st of the current month through `now` | Same-length prefix of the previous month |
| `last-month` | The entire previous calendar month | The calendar month before that |
| `ytd` | Jan 1 of the current year through `now` | Same-length prefix of the previous year |
| `last-year` | The entire previous calendar year | The calendar year before that |
| `90d` | Rolling 90 days ending `now` (same style as existing `7d`/`30d`) | The 90 days before that |
| `custom` | Not resolved by this function — see below | — |

For `custom`, `resolveDateRange` cannot compute bounds from `now` alone; a
new function handles it instead:

```ts
export function resolveCustomRange(
  start: Date,
  end: Date,
): ResolvedDateRange {
  // current = [start, end]; previous = the equal-length window immediately
  // before start. interval picked via the same >60-day-span rule.
}
```

### URL scheme

`?range=` now accepts any `DateRangeKey`. When `range=custom`, two more
params are required: `?range=custom&start=2026-07-01&end=2026-07-15` (ISO
`YYYY-MM-DD`, no time component — matches how dates are already displayed
elsewhere in this app). `resolveRangeKeyParam` (added in the report-detail-
pages feature) is extended to recognize the new preset keys; a new
`resolveCustomRangeParams(start, end): { start: Date; end: Date } | null`
helper validates the two date strings (parses cleanly, `start <= end`),
returning `null` on anything invalid so the caller can fall back to
`"today"` — same fallback-on-bad-input posture `resolveRangeKeyParam`
already has.

This makes every range — including a custom one — shareable via URL,
consistent with how `?range=7d` already works today.

## UI

### The "Custom" chip

Added to `DashboardDateFilter` (`src/components/analytics/DashboardDateFilter.tsx`),
styled identically to the existing 3 chips (`CHIP_CLASS`, same active-state
treatment). When the active range is a named custom preset or an actual
custom range, the chip shows that range's label (e.g. "Last 90 Days", or
"Jul 1 – Jul 15" for a custom range) instead of the literal word "Custom" —
mirroring how the reference screenshot's own trigger shows the resolved
label, not a static "Custom" caption.

### The popup

Clicking the chip opens a popover (client-side, positioned below the
chip) containing:

- **Left sidebar**: a vertical list of the 6 named presets + "Custom
  range", styled as simple list items (hover state, active/selected state)
  using this app's existing `--analytics-*` tokens — not a new visual
  language.
- **Right side**: only visible when "Custom range" is selected in the
  sidebar (the named presets apply immediately on click, closing the
  popup and updating the URL — no separate Apply step needed for those,
  since there's nothing left to configure). Shows:
  - Two start/end date display fields (read-only text showing the
    currently-picked range, updating live as the user clicks days).
  - A two-month calendar (`react-day-picker`, see below) in range-select
    mode.
  - Cancel / Apply buttons. Apply navigates to `?range=custom&start=...&end=...`
    on the current path (dashboard or a report page) preserving everything
    else about the current view. Cancel closes the popup without changing
    the URL.

### Calendar engine: `react-day-picker`

This project has no date-picker library today. Hand-rolling month-grid
generation, leap-year handling, and range-highlight logic from scratch is
substantial, error-prone surface area for something a well-tested library
already solves. Add `react-day-picker` (currently v10 on npm) as a
dependency.

**Important — this is not the react-day-picker most tutorials describe.**
v10 (published very recently) renamed several `classNames` keys from the
v8/v9 API most existing examples and AI training data reflect (e.g.
`table` → `month_grid`, `day_selected` → `selected`, `nav_button` →
`button_previous`/`button_next`). Before writing the calendar component,
the implementing task must read the actual installed package's TypeScript
type definitions (`node_modules/react-day-picker/dist/**/*.d.ts` or
equivalent) and/or fetch `https://daypicker.dev` directly, rather than
reusing remembered v8-style prop/classNames names — the plan for this
task will say so explicitly rather than hardcoding possibly-wrong API
calls.

Use `mode="range"` with `numberOfMonths={2}` for the side-by-side layout,
fully restyled via the `classNames` prop (or the newer CSS-variable/data-
attribute styling hooks, whichever the installed version's docs recommend)
to use this app's `--analytics-*` design tokens — no default DayPicker
styling should be visible.

## Where this plugs in

- `DashboardDateFilter` is used identically on both the main dashboard
  (`page.tsx`) and every report detail page (`reports/[slug]/page.tsx`) —
  the new Custom chip and popup work in both places automatically, no
  separate wiring needed per page.
- `getDashboardData(rangeKey)` in `actions.ts` currently takes only a
  `DateRangeKey`. It needs an overload/second optional parameter for an
  explicit custom range, since `"custom"` alone doesn't carry the actual
  dates — e.g. `getDashboardData(rangeKey, customBounds?)` where
  `customBounds` is only read when `rangeKey === "custom"`.
- Mock data (`mock-data.ts`) generates its bucket labels/series length from
  `rangeKey` today (`"today"` → 24 hourly buckets, else 7 or 30 daily
  buckets). It needs to generalize to: compute actual day/week/hour span
  from the resolved range's `current` bounds and `interval`, rather than
  branching on a fixed 3-way enum — this is the same generalization the
  real WC/GA4 fetchers already get for free (they already loop over
  whatever `range.current`/`range.previous` bounds they're given; only the
  mock generator and the interval-driven cache-bucketing in
  `withRangeCache` hardcode the old 3-way assumption).
- `withRangeCache` (`cache.ts`) currently splits caching into a
  short-lived bucket for `range.key === "today"` and a longer-lived bucket
  for everything else. That split still makes sense (today's data changes
  fastest) — no change needed there beyond it continuing to work for the
  new keys, which it already does since it only branches on `"today"`.
- `ga4/format.ts`'s `formatBucketLabel(rawDate, interval)` and
  `alignSeries(...)` currently switch on `interval: "hour" | "day"` only —
  broadening `ResolvedDateRange.interval` to include `"week"` means this
  function needs a third branch (e.g. label a week bucket by its start
  date, "Jul 1"). Every real GA4 fetcher already calls these two functions
  for its bucketed charts, so this one addition covers all of them at
  once; TypeScript's exhaustiveness will surface any call site this spec
  missed once the `interval` union grows.

## Out of scope

- Comparison-mode UI (showing two independently-configurable date ranges
  side by side, like some analytics tools). This feature only adds ways to
  pick the *current* period — the "previous period" comparison is still
  always auto-derived as an equal-length preceding window, exactly like
  today's 3 presets.
- Persisting a user's custom range as a saved/named preset.
- Any Shopify-specific presets not in the confirmed list (Black Friday,
  Cyber Monday, Quarters).
