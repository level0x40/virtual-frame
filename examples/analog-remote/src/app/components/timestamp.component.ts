import { Component, OnDestroy, afterNextRender } from "@angular/core";

@Component({
  selector: "app-timestamp",
  standalone: true,
  template: `
    <p class="timestamp">Rendered at: {{ time }}</p>
  `,
  styles: [
    `
      .timestamp {
        font-size: 12px;
        text-align: right;
        opacity: 0.6;
        margin-top: 8px;
      }
    `,
  ],
})
export class TimestampComponent implements OnDestroy {
  time = new Date().toISOString();
  private interval?: ReturnType<typeof setInterval>;

  constructor() {
    afterNextRender(() => {
      this.interval = setInterval(() => {
        this.time = new Date().toISOString();
      }, 1000);
    });
  }

  ngOnDestroy() {
    if (this.interval) clearInterval(this.interval);
  }
}
