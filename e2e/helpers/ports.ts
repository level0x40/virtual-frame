import net from "node:net";
import {
  existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Resolves once a TCP server is accepting connections on `port` (localhost),
 * or rejects after `timeoutMs`. Used by `server.ts` to detect when an example's
 * dev/prod server is ready.
 *
 * We poll with a short interval rather than long-waiting on a single connection
 * because dev servers typically bind their port early but only become useful
 * once their compile pass finishes — repeated cheap probes are simpler than
 * trying to detect "compile done" per framework.
 */
export async function waitForPort(
  port: number,
  opts: { hosts?: string[]; timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  // Probe both loopbacks. Vite 8 and some Node servers bind to `::1` on
  // macOS even when the app URL says `localhost`, so a 127.0.0.1-only
  // probe can never resolve.
  const hosts = opts.hosts ?? ["127.0.0.1", "::1"];
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const host of hosts) {
      if (await tryConnect(host, port)) return;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${hosts.join("/")}:${port}`,
  );
}

function tryConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
    socket.connect(port, host);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ask the OS to assign us a free ephemeral port, then close the listener
 * immediately. To prevent TOCTOU races across Playwright workers (which
 * run in separate processes), we coordinate via a shared lockdir in $TMPDIR.
 * Each reserved port gets a marker file; `getFreePort` checks the dir
 * before returning a candidate.
 *
 * Marker files are cleaned up by the process that created them on exit,
 * plus any stale markers older than 10 minutes are ignored.
 */

// Pick from a constrained mid-range rather than the OS ephemeral range
// (macOS: 49152–65535). Some framework CLIs derive secondary ports from
// `PORT` by adding an offset (react-server's dev server spawns internal
// sockets at `PORT + N`), and an ephemeral base would push those past
// 65535 → `ERR_SOCKET_BAD_PORT`. A base below ~40000 leaves headroom.
const PORT_MIN = 20_000;
const PORT_MAX = 40_000;

// Per-process reservation set — fast path to avoid re-probing our own ports.
const reserved = new Set<number>();

// Cross-process coordination directory. All Playwright workers within the
// same test run share this dir. Files are named by port number.
const LOCK_DIR = join(tmpdir(), "vf-e2e-ports");

function ensureLockDir(): void {
  if (!existsSync(LOCK_DIR)) {
    try {
      mkdirSync(LOCK_DIR, { recursive: true });
    } catch {
      /* race with another worker — fine */
    }
  }
}

function isPortReservedCrossProcess(port: number): boolean {
  try {
    const marker = join(LOCK_DIR, String(port));
    if (!existsSync(marker)) return false;
    // Ignore stale markers older than 10 minutes — leftover from a
    // previous run that didn't clean up (crash, SIGKILL, etc.)
    const { mtimeMs } = statSync(marker);
    if (Date.now() - mtimeMs > 10 * 60 * 1000) {
      try { unlinkSync(marker); } catch { /* ok */ }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomically reserve a port across processes. Uses O_CREAT|O_EXCL (flag "wx")
 * so exactly one writer succeeds — no read-back needed.
 * Returns true if we won the reservation, false otherwise.
 */
function reservePortCrossProcess(port: number): boolean {
  ensureLockDir();
  try {
    writeFileSync(join(LOCK_DIR, String(port)), String(process.pid), { flag: "wx" });
    return true;
  } catch {
    // File already exists — another worker grabbed it first.
    return false;
  }
}

// Clean up our markers on exit.
const ownMarkers = new Set<string>();
function cleanupMarkers(): void {
  for (const marker of ownMarkers) {
    try { unlinkSync(marker); } catch { /* best effort */ }
  }
}
process.on("exit", cleanupMarkers);
process.on("SIGTERM", () => { cleanupMarkers(); process.exit(0); });
process.on("SIGINT", () => { cleanupMarkers(); process.exit(0); });

function randomPort(): number {
  return PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN));
}

export async function getFreePort(): Promise<number> {
  ensureLockDir();

  // Clean stale markers from previous runs on first call.
  try {
    for (const entry of readdirSync(LOCK_DIR)) {
      const marker = join(LOCK_DIR, entry);
      try {
        const { mtimeMs } = statSync(marker);
        if (Date.now() - mtimeMs > 10 * 60 * 1000) {
          unlinkSync(marker);
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = randomPort();

    // Fast path: skip ports we already allocated in this process.
    if (reserved.has(candidate)) continue;

    // Cross-process check: skip ports another worker reserved.
    if (isPortReservedCrossProcess(candidate)) continue;

    // Probe the port — is it actually free on the OS?
    const free = await probePort(candidate);
    if (!free) continue;

    // Atomically reserve cross-process (O_CREAT|O_EXCL).
    if (!reservePortCrossProcess(candidate)) continue; // lost race

    reserved.add(candidate);
    ownMarkers.add(join(LOCK_DIR, String(candidate)));
    return candidate;
  }

  throw new Error("Failed to find a free port after 100 attempts");
}

/**
 * Probe whether a port is free by briefly binding to it.
 */
function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: "127.0.0.1" }, () => {
      srv.close(() => resolve(true));
    });
  });
}
