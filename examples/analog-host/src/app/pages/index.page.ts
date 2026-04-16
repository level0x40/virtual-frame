import {
  Component,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal,
} from "@angular/core";
import {
  NgIf,
  isPlatformBrowser,
  isPlatformServer,
} from "@angular/common";
import { TransferState, makeStateKey } from "@angular/core";
import { VirtualFrameComponent } from "@virtual-frame/analog";
import { createStore, getStore } from "@virtual-frame/store";
import { FRAME_DATA, type FrameData } from "../frame-data";

// The remote URL is resolved at runtime on the server (from process.env in
// main.server.ts) and travels to the client inside the transferred
// FrameData's `src` field — so the build artifact is port-independent.
// Falling back to the default remote port only covers the impossible-in-practice
// case where TransferState is missing (e.g. navigating directly to the client
// without SSR).
const FALLBACK_REMOTE_URL = "http://127.0.0.1:3011";
const PROXY = "/__vf";

const FRAME_DATA_KEY = makeStateKey<FrameData>("vf.frameData");

// Module-level store singleton
const store = createStore();
store.count = 0;

@Component({
  selector: "app-index-page",
  standalone: true,
  imports: [NgIf, VirtualFrameComponent],
  template: `
    <div class="page">
      <h1>Virtual Frame — Analog SSR Example</h1>
      <p class="subtitle">
        Two separate Analog apps: <strong>host</strong> (port 3010) fetches
        <strong>remote</strong> (port 3011) during SSR via
        <code>fetchVirtualFrame()</code>, then VirtualFrame mirrors on the
        client via a hidden iframe.
      </p>

      <ng-container *ngIf="data">
        <div class="panel info">
          <strong>How it works:</strong> The host calls
          <code>fetchVirtualFrame()</code> in a Nitro server route to fetch the
          remote Analog page during SSR.
          <code>prepareVirtualFrameProps()</code> wraps the content in declarative
          shadow DOM for instant display. On the client, a hidden
          <code>&lt;iframe src&gt;</code> loads the remote app at its real origin —
          the <strong>cross-origin bridge</strong> handles live DOM mirroring via
          <code>postMessage</code>. Two
          <code>&lt;virtual-frame&gt;</code> components are rendered — one showing
          the full page, one showing only <code>#counter-card</code>. Both
          <strong>share a single hidden iframe</strong> (ref-counted). The
          <code>store</code> input bridges <code>&#64;virtual-frame/store</code>
          state between the host and remote via a <code>MessagePort</code>.
        </div>

        <div class="panel">
          <h2>Shared Store</h2>
          <p class="store-description">
            Modify the counter from the host — changes propagate live to the remote
            app via <code>&#64;virtual-frame/store</code>.
          </p>
          <div class="counter-controls">
            <button (click)="decrement()">- Decrement</button>
            <span class="counter-value">{{ count() }}</span>
            <button (click)="increment()">+ Increment</button>
          </div>
        </div>

        <div class="panel">
          <h2>Full Remote App (no selector)</h2>
          <virtual-frame
            [src]="data!.fullFrame.src"
            [isolate]="data!.fullFrame.isolate"
            [selector]="data!.fullFrame.selector"
            [proxy]="data!.fullFrame.proxy"
            [vfHtml]="data!.fullFrame._vfHtml"
            [store]="store"
          />
        </div>

        <div class="panel">
          <h2>Counter Card Only (selector: <code>#counter-card</code>)</h2>
          <virtual-frame
            [src]="data!.counterFrame.src"
            [isolate]="data!.counterFrame.isolate"
            [selector]="data!.counterFrame.selector"
            [proxy]="data!.counterFrame.proxy"
            [vfHtml]="data!.counterFrame._vfHtml"
            [store]="store"
          />
        </div>
      </ng-container>
    </div>
  `,
  styles: [
    `
    :host {
      display: block;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    .page {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f0f2f5;
      padding: 32px;
      color: #1a1a2e;
      min-height: 100vh;
    }

    h1 {
      margin-bottom: 8px;
    }

    .subtitle {
      color: #555;
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .panel {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      margin-bottom: 24px;
    }
    .panel h2 {
      margin-bottom: 16px;
    }
    .info {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
      color: #2e7d32;
      line-height: 1.6;
    }
    code {
      background: rgba(0, 0, 0, 0.06);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .store-description {
      color: #666;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .counter-controls {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .counter-value {
      font-size: 32px;
      font-weight: bold;
      min-width: 60px;
      text-align: center;
    }
    button {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #ccc;
      background: #fff;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    button:hover {
      background: #f0f0f0;
    }
  `,
  ],
})
export default class IndexPage implements OnInit, OnDestroy {
  data: FrameData | null = null;
  store = store;
  count = signal(0);

  private readonly frameData = inject(FRAME_DATA, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly transferState = inject(TransferState);

  private unsubscribe?: () => void;

  ngOnInit() {
    // --- Frame data setup ---
    if (isPlatformServer(this.platformId) && this.frameData) {
      this.data = this.frameData as FrameData;
      this.transferState.set(FRAME_DATA_KEY, this.data);
    } else if (isPlatformBrowser(this.platformId)) {
      const transferred = this.transferState.get(FRAME_DATA_KEY, null);
      // Prefer the server-supplied `src` (derived from REMOTE_URL at runtime).
      // Only fall back to the compile-time default if SSR didn't populate
      // TransferState — which shouldn't happen in normal SSR boots.
      const fullSrc = transferred?.fullFrame?.src ?? FALLBACK_REMOTE_URL;
      const counterSrc = transferred?.counterFrame?.src ?? FALLBACK_REMOTE_URL;
      this.data = {
        fullFrame: {
          _vfHtml: transferred?.fullFrame?._vfHtml ?? "",
          src: fullSrc,
          isolate: "open",
          proxy: PROXY,
        },
        counterFrame: {
          _vfHtml: transferred?.counterFrame?._vfHtml ?? "",
          src: counterSrc,
          isolate: "open",
          selector: "#counter-card",
          proxy: PROXY,
        },
      };
      this.transferState.remove(FRAME_DATA_KEY);
    }

    // --- Store subscription ---
    const handle = getStore(store);
    this.count.set((handle.readPath(["count"]) as number) ?? 0);
    this.unsubscribe = handle.subscribe(["count"], () => {
      this.count.set((handle.readPath(["count"]) as number) ?? 0);
    });
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  increment() {
    store.count = this.count() + 1;
  }

  decrement() {
    store.count = this.count() - 1;
  }
}
