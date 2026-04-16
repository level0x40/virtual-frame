import { defineConfig, devices } from "@playwright/test";
import os from "node:os";

/**
 * Playwright config for the virtual-frame e2e suite.
 *
 * Each spec under `specs/` boots its example's host (and remote, if any)
 * via `helpers/server.ts`, then drives a real browser against the running
 * servers. Specs cover both `dev` and `prod` mode.
 *
 * ## Parallelism strategy
 *
 * Each spec file loops over ["dev", "prod"] and creates a `describe.serial`
 * block per mode. With `fullyParallel: true`, Playwright can schedule these
 * blocks across workers freely — including the dev and prod blocks of the
 * SAME spec in different workers simultaneously. That causes filesystem
 * races (build writes to `dist/` while dev reads/watches the same
 * workspace) and port/process thrash.
 *
 * To prevent this:
 *   - `fullyParallel: false` — tests within a file run sequentially, so
 *     dev and prod of the same example never overlap.
 *   - `workers` capped at 4 (or CPU/4, whichever is smaller) — limits
 *     concurrent framework compilations + server processes. Each spec
 *     may spawn 2-4 processes; 4 workers × 4 processes = 16, which is
 *     manageable. Higher parallelism saturates CPU/memory and triggers
 *     boot timeouts on any mid-range machine.
 *   - Spec files are still distributed across workers, so different
 *     examples run in parallel — just not dev/prod of the same example.
 */
const maxWorkers = Math.min(4, Math.max(1, Math.floor(os.cpus().length / 4)));

export default defineConfig({
  testDir: "./specs",
  testMatch: "**/*.spec.ts",
  // Tests within a file run sequentially so dev/prod of the same example
  // don't overlap. Different spec files still run in parallel across workers.
  fullyParallel: false,
  workers: maxWorkers,
  // Generous timeouts: prod-mode specs build the example before booting,
  // and frameworks like Next.js / Nuxt / Vinxi take 30–90s to come online.
  // Cold compiles (Angular + rspack-mf + next-dev) can each take 30–90s;
  // prod-mode specs also run a vp build before any test. Budget
  // accordingly so boot failures surface as real errors rather than as
  // generic hook timeouts.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: undefined, // each spec navigates with absolute URLs
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
