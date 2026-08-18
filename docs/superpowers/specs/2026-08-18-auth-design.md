# Authentication Design

## Goal

Protect every page in the dashboard (`/`, `/live`, `/reports/*`) behind a
login, with exactly two fixed accounts — `admin` and `viewer` — plus a
one-click auto-login path from a "Analytics" button in the WordPress
admin, so viewers don't have to type credentials at all.

## Scope confirmed with the user

- Only two accounts exist, both hardcoded via env vars. No signup, no
  user database, no password reset flow.
- The `admin`/`viewer` roles currently grant **identical access** — every
  page, every report. The role field exists so the WordPress magic-link
  path can be restricted to `viewer` only (see below), not because any
  page differs by role today.
- No visible logout button. Sessions just expire on their own.
- Session: a signed cookie, 30-day sliding expiry (refreshed on every
  authenticated request), no database.
- No new auth dependency (no NextAuth/Auth.js) — this app has exactly two
  static accounts, which doesn't need a library built for arbitrary users
  and providers.
- This Next.js version (16.3.0) has renamed `middleware.js` to
  `proxy.js` — functionally the same file convention, but Proxy now
  defaults to the **Node.js runtime** (previously Edge-only), which is
  what makes it safe to use Node's built-in `crypto` module directly in
  the gate itself, with no Web Crypto workarounds.
- The WordPress-side admin-menu button and PHP token snippet are
  **documented here for hand-off**, not implemented in this repo — the
  user will add them to `BlackForestMDTheme`/`plugins` themselves.

## Architecture

A single `src/proxy.ts` runs on every request and is the sole
authentication gate: it reads the session cookie, verifies its signature
and expiry, and redirects to `/login` if it's missing or invalid (passing
the original path as `?next=`), or away from `/login` back to `/` if the
visitor is already authenticated. `/login` and `/api/auth/magic-link` are
the only two routes exempt from the "must be authenticated" check, since
their whole job is to establish that session in the first place.

This app has no mutations and no per-role data restrictions today, and
every page already renders dynamically per request (via `searchParams` or
`force-dynamic`) rather than being statically cached across users — so a
single Proxy-level gate is proportionate here. (Next's own guidance is
that Proxy checks should usually be paired with a per-request Data Access
Layer check for defense-in-depth; that's deliberately not built here,
since it would duplicate the same cookie check for no real benefit at
this app's current scope. If pages ever gain per-role behavior or
mutations, add that check at that point.)

Two login paths feed the same session cookie:

1. **Manual login** (`/login`): either account, username + password,
   entered by hand.
2. **Magic link** (`/api/auth/magic-link`): WordPress-issued, always
   produces a `viewer` session, never `admin`.

## Components

### `src/lib/auth/token.ts`

A generic HMAC-SHA256 sign/verify primitive, built on Node's `crypto`
(`createHmac`, `timingSafeEqual`) — no new dependency. Deliberately
string-in/string-out and reused by both the session cookie and the magic
link, which have different payloads and different secrets:

```ts
function sign(value: string, secret: string): string; // "value.hexHmac"
function verify(token: string, secret: string): string | null; // returns value, or null if bad/tampered
```

### `src/lib/auth/credentials.ts`

Reads `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `VIEWER_USERNAME` /
`VIEWER_PASSWORD` from the environment. `verifyCredentials(username,
password)` compares both fields with `crypto.timingSafeEqual` against
each configured account and returns `{ role: "admin" | "viewer" }` or
`null`. Username and password are checked independently (both wrong,
either wrong) but the caller only ever surfaces one generic "invalid
username or password" message, so failure responses don't leak which
field was wrong.

### `src/lib/auth/session.ts`

Builds the session cookie value as `sign("<role>:<expiryUnixSeconds>",
SESSION_SECRET)`. Exposes:

- `createSessionCookieValue(role): string`
- `verifySessionCookieValue(value): { role } | null` — checks the
  signature via `token.verify`, then checks `expiry > now`.

Cookie: `bf_session`, `httpOnly`, `secure` (in production), `sameSite:
"lax"`, `path: "/"`, `maxAge` matching the 30-day expiry encoded in the
payload. Proxy re-issues the cookie with a fresh 30-day expiry on every
valid authenticated request (sliding expiry).

### `src/lib/auth/actions.ts`

A `"use server"` `login(prevState, formData)` action:

1. Reads `username`/`password`/`next` from the form.
2. `verifyCredentials` — on failure, returns `{ error: "Invalid username or password" }`.
3. On success, sets the session cookie and `redirect()`s to `next` if
   it's a same-origin relative path (starts with `/`, not `//`), else
   `/` — this guards against `next` being used as an open redirect.

### `src/proxy.ts`

```
matcher: everything except _next/static, _next/image, and known public
static assets (favicon.ico, *.svg used by the app, etc).

for each request:
  if path is /login or /api/auth/magic-link -> allow through unchanged
  session = verifySessionCookieValue(cookie)
  if !session:
    if path is protected -> redirect to /login?next=<path>
  else:
    if path is /login -> redirect to /
    else -> allow through, refresh the cookie's expiry
```

### `src/app/login/page.tsx` + `src/components/auth/LoginForm.tsx`

A Server Component page reading `searchParams.next` and passing it as a
hidden field, rendering a small `"use client"` form that uses
`useActionState` with the `login` action to show the inline error message
without a full page reload. Styled with the dashboard's existing
`--analytics-*` CSS custom properties for visual consistency, no new
design system.

### `src/app/api/auth/magic-link/route.ts`

`GET` handler:

1. Read `token` from the query string.
2. `token.verify(token, WP_MAGIC_LINK_SECRET)` — on failure (bad
   signature or malformed), redirect to `/login`.
3. Parse the verified value as an expiry timestamp; if it's in the past,
   redirect to `/login`.
4. Otherwise, unconditionally set a `viewer`-role session cookie (the
   token's payload carries no role — this route only ever knows how to
   mint `viewer` sessions, so a compromised `WP_MAGIC_LINK_SECRET` can
   never be used to obtain `admin` access) and redirect to `/`.

## WordPress hand-off (not implemented in this repo)

Token format is deliberately minimal so it's trivial to reproduce in
PHP without any shared library: `"<expiryUnixSeconds>.<hexHmacSha256>"`,
matching exactly what `token.sign`/`token.verify` do in
`src/lib/auth/token.ts`.

```php
// In BlackForestMDTheme (or a small mu-plugin), e.g. functions.php:

add_action('admin_menu', function () {
    add_menu_page(
        'Analytics',
        'Analytics',
        'manage_options', // restrict to WP users who can already see wp-admin as an admin/editor
        'bf-analytics-link',
        function () {
            $secret = getenv('WP_MAGIC_LINK_SECRET'); // must match the analytics app's env var
            $expiry = time() + 300; // 5 minutes
            $signature = hash_hmac('sha256', (string) $expiry, $secret);
            $token = $expiry . '.' . $signature;
            $url = 'https://<your-dashboard-domain>/api/auth/magic-link?token=' . urlencode($token);
            echo '<script>window.location.replace(' . json_encode($url) . ');</script>';
            echo '<p>Redirecting to Analytics…</p>';
        },
        'dashicons-chart-line'
    );
});
```

- `WP_MAGIC_LINK_SECRET` must be set identically in both WordPress
  (env var or a `wp-config.php` constant swapped into the snippet above)
  and the analytics app's `.env.local`. Treat it as a credential — do not
  commit it in either codebase.
- The token is generated fresh every time the WP admin page renders
  (not cached), so the 5-minute window comfortably covers "load the page,
  click the link."
- The link always logs the clicker in as `viewer`, regardless of which
  WP user clicked it — this button is a shared "give any WP admin user a
  peek at Analytics" convenience, not a per-person identity bridge.

## Error handling

- Wrong username/password: inline "Invalid username or password" on the
  login form, no distinction between which field was wrong.
- Missing/tampered/expired session cookie: treated identically to no
  cookie at all — redirect to `/login`.
- Missing/tampered/expired/malformed magic-link token: redirect to
  `/login` (silently — the user just ends up at a normal login screen,
  no error banner, since an expired magic link is an expected, common
  case rather than an error worth surfacing).
- `next` query param is validated as a same-origin relative path before
  being used in a redirect, both after manual login and by Proxy when it
  constructs the `/login?next=...` redirect.

## Testing

- `token.ts` — sign/verify round-trip, tamper detection (flipped
  signature byte), malformed-token handling.
- `session.ts` — valid session round-trip, expired session rejected,
  cookie tampering rejected.
- `credentials.ts` — correct admin/viewer credentials accepted, wrong
  username, wrong password, and swapped-account credentials all
  rejected.
- `src/app/api/auth/magic-link/route.ts` — valid token mints a viewer
  session and redirects to `/`; expired, tampered, and missing tokens
  all redirect to `/login` without setting a cookie.
- `src/proxy.ts` itself is not unit tested (Next's proxy-testing
  utilities are overkill for this app's two static accounts); its
  behavior is covered indirectly through the session/token tests plus
  manual verification (dev server, curl) before this ships.
- `LoginForm` — not unit tested, matching this codebase's existing
  precedent of leaving small interactive client components
  (`ThemeToggle`, `DashboardDateFilter`) to manual/Playwright
  verification rather than component tests.

## Where this plugs in

- New: `src/lib/auth/token.ts`
- New: `src/lib/auth/credentials.ts`
- New: `src/lib/auth/session.ts`
- New: `src/lib/auth/actions.ts`
- New: `src/proxy.ts`
- New: `src/app/login/page.tsx`
- New: `src/components/auth/LoginForm.tsx`
- New: `src/app/api/auth/magic-link/route.ts`
- Modify: `.env.example` — add `SESSION_SECRET`, `ADMIN_USERNAME`,
  `ADMIN_PASSWORD`, `VIEWER_USERNAME`, `VIEWER_PASSWORD`,
  `WP_MAGIC_LINK_SECRET`

## Out of scope

- Any per-role difference in what admin vs. viewer can see or do.
- A visible logout control.
- Password reset / account recovery — there's no email system and only
  two hand-configured accounts.
- A user database, more than two accounts, or self-service signup.
- One-time-use enforcement on magic-link tokens (would require server-
  side state to track used tokens, which conflicts with the stateless
  design; the 5-minute expiry is the sole mitigation for a leaked link).
- Implementing the WordPress-side admin menu button/plugin in this repo.
