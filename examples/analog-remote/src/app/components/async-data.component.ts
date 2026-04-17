import { Component, afterNextRender } from "@angular/core";
import { NgIf } from "@angular/common";

@Component({
  selector: "app-async-data",
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="card" id="async-card">
      <h2>Async Data Fetch</h2>
      <p>
        Async data fetching via <code>fetch()</code> — the loading state renders first, then the
        resolved content replaces it.
      </p>
      <div *ngIf="loading" class="suspense-loading">Loading async data...</div>
      <div *ngIf="!loading" class="suspense-loaded">
        {{ message }}
      </div>
    </div>
  `,
  styles: [
    `
      .card {
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 16px;
      }
      h2 {
        margin-bottom: 12px;
      }
      p {
        margin: 0 0 16px;
        opacity: 0.9;
        line-height: 1.6;
      }
      code {
        background: rgba(255, 255, 255, 0.15);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 14px;
      }
      .suspense-loading {
        padding: 16px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        text-align: center;
        opacity: 0.7;
        animation: pulse 1.5s ease-in-out infinite;
      }
      .suspense-loaded {
        padding: 16px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.15);
        border-left: 3px solid rgba(255, 255, 255, 0.5);
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 0.5;
        }
        50% {
          opacity: 0.8;
        }
      }
    `,
  ],
})
export class AsyncDataComponent {
  loading = true;
  message = "";

  constructor() {
    afterNextRender(() => {
      this.fetchData();
    });
  }

  private async fetchData() {
    try {
      const res = await fetch("/api/slow-data");
      const data = await res.json();
      this.message = data.message;
    } catch {
      this.message = "Failed to load data.";
    } finally {
      this.loading = false;
    }
  }
}
