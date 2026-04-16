# Module Federation + Virtual Frame Example

This example demonstrates using **Module Federation v2** (via Rspack) and **Virtual Frame** together in the same application, sharing state through `@virtual-frame/store`.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Host (Rspack, port 3010)                           │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │   Host    │  │ MF Counter│  │ VF Counter│       │
│  │  Counter  │  │ (Module   │  │ (iframe + │       │
│  │ (native)  │  │  Fed.)    │  │  mirror)  │       │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘       │
│        │              │              │              │
│        └──────────────┼──────────────┘              │
│                       │                             │
│              ┌────────┴────────┐                    │
│              │  Shared Store   │                    │
│              │ (count, todos)  │                    │
│              └────────┬────────┘                    │
│                       │                             │
│           ┌───────────┴──────────────┐              │
│           │ MessagePort              │              │
│           ▼                          ▼              │
│   Module Federation           Virtual Frame         │
│   (same JS context)          (iframe, proxied)      │
└───────────────────────────────────────────────────── ┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Remote (Rspack, port 3011)                         │
│                                                     │
│  • Exposes Counter via Module Federation             │
│  • Full app served in iframe for Virtual Frame       │
│  • Shared store synced via MessagePort               │
└─────────────────────────────────────────────────────┘
```

## Three rendering strategies, one shared store

| Strategy | How it works | Isolation | Latency |
|----------|-------------|-----------|---------|
| **Host Counter** | Rendered natively by the host app | None (same code) | Zero |
| **MF Counter** | Counter component loaded via Module Federation | Same JS context | Module load time only |
| **VF Counter** | Remote app in iframe, projected via Virtual Frame | Full iframe isolation | MessagePort (~<1ms) |

All three read and write the same `@virtual-frame/store` instance. Click any button — all three update.

## Running

From the monorepo root:

```sh
pnpm example:rspack-mf
```

Or start each individually:

```sh
# Terminal 1 — Remote (must start first)
cd examples/rspack-mf-remote
pnpm dev

# Terminal 2 — Host
cd examples/rspack-mf-host
pnpm dev
```

Open http://localhost:3010 in your browser.
