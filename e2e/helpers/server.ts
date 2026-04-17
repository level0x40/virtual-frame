import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { waitForPort, getFreePort } from "./ports.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLES_ROOT = join(REPO_ROOT, "examples");

/**
 * Resolve a workspace filter name (e.g. `example-vue`) to its directory on
 * disk, by scanning every `examples/*\/package.json` for a matching `name`.
 */
const workspaceDirCache = new Map<string, string>();
function findWorkspaceDir(filter: string): string {
  const cached = workspaceDirCache.get(filter);
  if (cached) return cached;

  for (const entry of readdirSync(EXAMPLES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(EXAMPLES_ROOT, entry.name, "package.json");
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: string;
      };
      if (pkg.name === filter) {
        const dir = join(EXAMPLES_ROOT, entry.name);
        workspaceDirCache.set(filter, dir);
        return dir;
      }
    } catch {
      /* ignore */
    }
  }
  throw new Error(
    `Could not find workspace directory for filter "${filter}" under ${EXAMPLES_ROOT}`,
  );
}

/**
 * Read the named script from a workspace's package.json. Throws if the
 * workspace or script is missing.
 */
function readScript(workspaceDir: string, scriptName: string): string {
  const pkgPath = join(workspaceDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const cmd = pkg.scripts?.[scriptName];
  if (!cmd) {
    throw new Error(`Workspace ${workspaceDir} has no "${scriptName}" script in package.json`);
  }
  return cmd;
}

/**
 * Build a PATH that sees every `node_modules/.bin` along the workspace's
 * ancestry up to the repo root. That's what `pnpm run` does under the hood
 * — we reimplement it so we can spawn the framework CLI directly, without
 * a pnpm wrapper that would (a) add latency and (b) munge our SIGTERM into
 * an `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` on teardown.
 */
function buildPath(workspaceDir: string): string {
  const segments: string[] = [];
  let cur = workspaceDir;
  while (cur.startsWith(REPO_ROOT)) {
    segments.push(join(cur, "node_modules", ".bin"));
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  segments.push(join(REPO_ROOT, "node_modules", ".bin"));
  return [...segments, process.env.PATH ?? ""].filter(Boolean).join(":");
}

export type Mode = "dev" | "prod";

export interface SpawnExampleOptions {
  /**
   * Workspace package names, in **logical order**:
   *   - 1-element array: single-app example. `urls[0]` is that app.
   *   - 2-element array: `[host, remote]`. `urls[0]` is host, `urls[1]` is remote.
   *     The host is started with `REMOTE_URL=urls[1]` and
   *     `VITE_REMOTE_URL=urls[1]` so both runtime and bundler-inlined reads
   *     point at the dynamically allocated remote.
   */
  filters: string[];
  /** `dev` → `pnpm --filter <f> dev`; `prod` → `vp run build` then `pnpm --filter <f> start`. */
  mode: Mode;
  /** Per-server boot timeout in ms. Defaults to 180s — prod cold builds are slow. */
  bootTimeoutMs?: number;
  /** Extra env vars passed to every spawned workspace. */
  env?: Record<string, string>;
}

export interface ServerHandle {
  /** Same order as `opts.filters`. `urls[i]` = `http://localhost:${allocatedPort}`. */
  urls: string[];
  /** Send SIGTERM (then SIGKILL after grace) to every spawned process group. */
  dispose(): Promise<void>;
}

/**
 * Spawn one or more example workspace packages on **dynamically-allocated
 * ports**, set `REMOTE_URL` / `VITE_REMOTE_URL` so hosts talk to their
 * remote, wait for every port to come online, and return the URLs + a
 * disposer.
 *
 * One `pnpm --filter <f> <task>` child per workspace (not a single
 * `vp run`), because vp can't pass per-workspace env vars — every
 * workspace in one vp invocation would share the same `PORT`.
 *
 * For prod mode we first run a single `vp run build` for all filters
 * (vp handles dependency ordering and caching), then start each
 * workspace separately with its own runtime env.
 *
 * Children are detached so we can kill their entire process group on
 * teardown — the spawned `pnpm` fork-execs framework CLIs, which in turn
 * spawn node servers; only signalling the whole group shuts the tree down
 * cleanly.
 *
 * stdout/stderr are buffered and dumped on boot failure. Set
 * `VF_E2E_VERBOSE=1` to also stream them live, tagged by workspace name.
 */
export async function spawnExample(opts: SpawnExampleOptions): Promise<ServerHandle> {
  const verbose = !!process.env.VF_E2E_VERBOSE;
  const bootTimeoutMs = opts.bootTimeoutMs ?? 180_000;

  // Allocate a free port per filter up front so the host knows the remote's
  // URL before we start either process.
  const ports = await Promise.all(opts.filters.map(() => getFreePort()));
  // Use 127.0.0.1 (not "localhost") so Playwright's browser connects to the
  // same loopback interface Vite / Next / etc bind to by default. On macOS
  // `localhost` can resolve to `::1` first, which Vite 8 doesn't listen on.
  const urls = ports.map((p) => `http://127.0.0.1:${p}`);

  // Host/remote convention: filter[0] is host, filter[1] is remote (if present).
  const remoteUrl = urls[1];

  // Prod: build everything first with the remote URL in env, so frameworks
  // that inline it at build time (analog client, rspack-mf) pick up the
  // right value. VP caches the build keyed on REMOTE_URL / VITE_REMOTE_URL,
  // so parallel workers with different ports each get their own cache entry
  // and don't race on the same output dir.
  if (opts.mode === "prod") {
    await runBuild(
      opts.filters,
      {
        // Only pass REMOTE_URL when there actually is a remote, so
        // single-app examples (hono-ssr, angular, etc.) share the
        // default cache entry with other builds that also don't
        // set REMOTE_URL. Without this, passing REMOTE_URL="" creates
        // a unique cache key per invocation, forcing redundant rebuilds
        // of shared deps when running in parallel with other specs.
        ...(remoteUrl ? { REMOTE_URL: remoteUrl, VITE_REMOTE_URL: remoteUrl } : {}),
        ...opts.env,
      },
      verbose,
      bootTimeoutMs,
    );
  }

  const children: ChildProcess[] = [];
  const childLogs: Map<ChildProcess, string[]> = new Map();
  // Track each child's filter tag independently of `children.indexOf` —
  // we start in reverse order, so children[0] is the remote, not the host,
  // and indexing by position mislabels failures.
  const childTag: Map<ChildProcess, string> = new Map();
  const childExited: Map<
    ChildProcess,
    { code: number | null; signal: NodeJS.Signals | null } | null
  > = new Map();

  try {
    // Start workspaces in REVERSE order (remote → host), sequentially.
    // Host apps typically need the remote reachable at boot time —
    // rspack-mf's host, for example, fetches the remote's mf-manifest.json
    // during dev startup. Starting the remote first and waiting for its
    // port before launching the host avoids that race.
    const startOne = async (filter: string, i: number) => {
      const port = ports[i];
      const tag = filter;
      const isHost = i === 0 && opts.filters.length > 1;

      const task = opts.mode === "dev" ? "dev" : "start";
      const workspaceDir = findWorkspaceDir(filter);
      const script = readScript(workspaceDir, task);

      // Next.js 16 added a cross-process lock: `next dev` writes its PID to
      // `.next/dev/` and refuses to start if another dev server is already
      // recorded there. Stale PID files from crashed/killed runs cause
      // "Another next dev server is already running" at boot. Clean up
      // proactively — we kill-tree children on teardown but a crash can
      // leave the lockfile behind, and parallel test runs against the same
      // example share the same dir.
      if (filter.startsWith("example-next")) {
        try {
          rmSync(join(workspaceDir, ".next", "dev"), {
            recursive: true,
            force: true,
          });
        } catch {
          /* best effort */
        }
      }

      // Strip file-watch flags from dev commands. The e2e harness doesn't
      // need HMR, and `tsx watch` / `vite --watch` pick up file changes
      // from concurrent builds (via workspace-linked packages),
      // causing the server to restart mid-test → ERR_CONNECTION_REFUSED.
      let cmd = script;
      if (cmd.includes("tsx watch")) {
        cmd = cmd.replace("tsx watch", "tsx");
      }

      // Spawn the framework CLI directly via `sh -c` so there's no pnpm
      // wrapper to turn our SIGTERM teardown into a recursive-run error.
      // `node_modules/.bin` is added to PATH, reproducing what pnpm run
      // does for us.
      const child = spawn("sh", ["-c", cmd], {
        cwd: workspaceDir,
        // Inherit stdin from the Playwright worker. `"ignore"` hands
        // react-server's dev server /dev/null on fd 0, which it reads as
        // "eval this empty module" and crashes with:
        //   Module "virtual:react-server-eval.jsx" does not export "default"
        // A plain `"pipe"` is no better — react-server then blocks
        // reading the pipe until EOF. Inheriting the parent's stdin
        // (typically the Playwright test runner, which is line-buffered
        // and never writes to us) sidesteps both failure modes.
        // stdin ignored (no framework actually needs it in these examples);
        // stdout/stderr piped so we can capture them into the error report
        // when boot fails. With all three ignored we get zero signal on
        // failures like "next dev exited code=1" — we can see the exit
        // code but not WHY.
        // When verbose, pipe stdout/stderr so we can buffer+stream them.
        // Otherwise fully ignore: no buffering, no write to parent fds, so
        // nothing the child prints can leak into the Playwright reporter.
        stdio: verbose ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "ignore"],
        // CRITICAL: detached makes the spawned `sh` the leader of a NEW
        // process group, so `process.kill(-child.pid, "SIGTERM")` in
        // killTree() can take down the entire framework-CLI subtree.
        // Without this, the framework's grandchildren get re-parented to
        // PID 1 on teardown (zombies), causing Next.js lockfile collisions
        // ("another next dev server already running") on subsequent runs
        // and gradual port-range exhaustion.
        detached: true,
        env: {
          ...process.env,
          PATH: buildPath(workspaceDir),
          FORCE_COLOR: "0",
          // Don't silence framework loggers when we want to debug.
          ...(verbose ? {} : { CI: "1" }),
          PORT: String(port),
          // Force every framework's dev/prod server to bind 127.0.0.1.
          // Different frameworks read different vars, so set them all:
          //   HOST          → Nuxt/Nitro, Vinxi (solid-start), Analog
          //   HOSTNAME      → Next.js (`next dev` / `next start`)
          //   NITRO_HOST    → Nitro explicit override
          HOST: "127.0.0.1",
          HOSTNAME: "127.0.0.1",
          NITRO_HOST: "127.0.0.1",
          ...(isHost
            ? {
                REMOTE_URL: remoteUrl!,
                VITE_REMOTE_URL: remoteUrl!,
              }
            : {}),
          ...opts.env,
        },
      });

      children.push(child);
      childTag.set(child, tag);
      const logs: string[] = [];
      childLogs.set(child, logs);
      childExited.set(child, null);

      const capture = (stream: "out" | "err") => (chunk: Buffer) => {
        const s = chunk.toString();
        logs.push(s);
        if (logs.length > 5_000) logs.splice(0, logs.length - 5_000);
        if (verbose) {
          const target = stream === "out" ? process.stdout : process.stderr;
          for (const line of s.split("\n")) {
            if (line.length > 0) target.write(`[${tag}] ${line}\n`);
          }
        }
      };
      child.stdout?.on("data", capture("out"));
      child.stderr?.on("data", capture("err"));

      child.once("exit", (code, signal) => {
        childExited.set(child, { code, signal });
      });

      if (verbose) {
        // eslint-disable-next-line no-console
        console.log(
          `[e2e] spawned ${tag} (${opts.mode}) on port ${port}${
            isHost ? ` REMOTE_URL=${remoteUrl}` : ""
          } pid=${child.pid}`,
        );
      }

      await waitForPort(port, { timeoutMs: bootTimeoutMs });
    };

    // Reverse order: filters[n-1] (remote) first, filters[0] (host) last.
    // After each remote's port opens, actually fetch its root URL until we
    // get a 200 with a non-empty body. This does two things:
    //   1. Warms up dev compilers that lazy-build on first request
    //      (rspack-mf's remote only emits mf-manifest.json after the first
    //      page load triggers the compilation).
    //   2. Validates the remote app works standalone before we ask the
    //      host to project it — surfaces remote-side boot errors early
    //      with a clear failure instead of a mysterious host hang.
    for (let i = opts.filters.length - 1; i >= 0; i--) {
      const filter = opts.filters[i]!;
      await startOne(filter, i);
      // Warm up every spawned app (remotes first thanks to reverse order,
      // then the host). This forces lazy-build dev servers to finish
      // their initial compile before any Playwright test runs against
      // them — otherwise specs like angular / rspack-mf intermittently
      // see a blank page while vite/rspack are still chewing on modules
      // behind the scenes, even though the port is already bound.
      await warmup(urls[i]!, filter, bootTimeoutMs);
    }
  } catch (err) {
    // Kill whatever we did start and surface every child's captured output.
    await Promise.all(children.map(killTree));
    const parts: string[] = [
      `Failed to boot example (mode=${opts.mode}, filters=${opts.filters.join(",")}, ports=${ports.join(",")}):`,
    ];
    for (const child of children) {
      const tag = childTag.get(child) ?? "?";
      const exited = childExited.get(child);
      parts.push(`--- ${tag} ---`);
      if (exited) {
        parts.push(`child exited early (code=${exited.code}, signal=${exited.signal})`);
      }
      parts.push((childLogs.get(child) ?? []).join(""));
    }
    parts.push(`original error: ${(err as Error).message}`);
    throw new Error(parts.join("\n"));
  }

  return {
    urls,
    async dispose() {
      await Promise.all(children.map(killTree));
    },
  };
}

/**
 * Run `vp run build` for the given filters with the given env,
 * waiting for it to complete. VP handles dependency ordering and
 * caching automatically via its dependency-aware execution.
 */
function runBuild(
  filters: string[],
  env: Record<string, string>,
  verbose: boolean,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["run", ...filters.flatMap((f) => ["--filter", f]), "build"];
    const child = spawn("vp", args, {
      cwd: REPO_ROOT,
      // When verbose, pipe stdout/stderr so we can buffer+stream them.
      // Otherwise fully ignore: no buffering, no write to parent fds, so
      // nothing the child prints can leak into the Playwright reporter.
      stdio: verbose ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        ...(verbose ? {} : { CI: "1" }),
        ...env,
      },
    });

    const logs: string[] = [];
    const capture = (stream: "out" | "err") => (chunk: Buffer) => {
      const s = chunk.toString();
      logs.push(s);
      if (logs.length > 5_000) logs.splice(0, logs.length - 5_000);
      if (verbose) {
        const target = stream === "out" ? process.stdout : process.stderr;
        for (const line of s.split("\n")) {
          if (line.length > 0) target.write(`[build] ${line}\n`);
        }
      }
    };
    child.stdout?.on("data", capture("out"));
    child.stderr?.on("data", capture("err"));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `vp build timed out after ${timeoutMs}ms for filters=${filters.join(",")}\n${logs.join("")}`,
        ),
      );
    }, timeoutMs);

    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `vp build failed (code=${code}) for filters=${filters.join(",")}\n${logs.join("")}`,
          ),
        );
    });
  });
}

/**
 * Kill the spawned process and all of its descendants.
 *
 * `child.pid` is the leader of its own process group (because we passed
 * `detached: true`). Sending the signal to `-pid` targets the whole group,
 * which is the only way to take down the framework CLI subprocesses pnpm
 * spawned beneath itself.
 */
/**
 * Hit a just-booted app's root URL until it returns a 200 with a non-empty
 * body, or we exceed the boot timeout. This forces lazy-compile dev servers
 * (rspack, vite with SSR) to finish their first build before the host tries
 * to consume them, and surfaces "remote crashed on boot" as an early,
 * legible failure.
 */
async function warmup(url: string, tag: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        // First rspack/vite compile can take tens of seconds — give the
        // individual request a generous budget within the overall deadline.
        signal: AbortSignal.timeout(Math.min(60_000, deadline - Date.now())),
        redirect: "follow",
      });
      if (res.ok) {
        const body = await res.text();
        if (body.length > 0) return;
        lastErr = new Error(`empty body from ${url}`);
      } else {
        lastErr = new Error(`${url} → HTTP ${res.status}`);
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `warmup failed for ${tag} at ${url}: ${(lastErr as Error)?.message ?? "unknown"}`,
  );
}

async function killTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (child.pid == null) return;

  const pgid = -child.pid;

  try {
    process.kill(pgid, "SIGTERM");
  } catch {
    /* group may already be gone */
  }

  const exited = await waitForExit(child, 5_000);
  if (!exited) {
    try {
      process.kill(pgid, "SIGKILL");
    } catch {
      /* nothing left to kill */
    }
    await waitForExit(child, 5_000);
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve(true);
    });
  });
}
