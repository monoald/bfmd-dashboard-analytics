import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Pinning TZ to UTC makes date/time assertions deterministic regardless of
    // the machine running the tests, but it also means UTC's lack of DST makes
    // this suite structurally blind to DST-crossing bugs in local-time date
    // arithmetic (src/lib/analytics/date-range.ts, mock-data.ts). Known,
    // deliberately-accepted gap as of the custom-date-range-picker feature's
    // final review (2026-08-10) — a couple of narrow DST edge cases in that
    // code are documented with inline comments rather than covered by tests
    // here, since verifying them reliably would need a separate test process
    // with a genuinely different TZ set before Node/V8 starts (env vars
    // changed mid-process, e.g. via vi.stubEnv, do not reliably affect Date's
    // local-time behavior in Node).
    env: { TZ: "UTC" },
  },
});
