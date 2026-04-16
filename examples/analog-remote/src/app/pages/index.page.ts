import { Component } from "@angular/core";
import { TimestampComponent } from "../components/timestamp.component";
import { CounterComponent } from "../components/counter.component";
import { EchoInputComponent } from "../components/echo-input.component";
import { ToggleCheckComponent } from "../components/toggle-check.component";
import { NavigationComponent } from "../components/navigation.component";
import { AsyncDataComponent } from "../components/async-data.component";

@Component({
  selector: "app-index-page",
  standalone: true,
  imports: [
    TimestampComponent,
    CounterComponent,
    EchoInputComponent,
    ToggleCheckComponent,
    NavigationComponent,
    AsyncDataComponent,
  ],
  template: `
    <div class="card" id="info-card">
      <h1>Remote Analog App</h1>
      <p>
        This page is a standalone Analog application. During SSR, the host app
        fetches this page and renders it instantly inside a virtual frame — no
        extra client-side network request needed!
      </p>
      <app-timestamp />
    </div>

    <app-counter />
    <app-navigation />
    <app-async-data />
    <app-echo-input />
    <app-toggle-check />
  `,
  styles: [
    `
    :host {
      display: block;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #dd0031 0%, #c3002f 100%);
      color: #fff;
      min-height: 100vh;
      padding: 32px;
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

    .card {
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 16px;
    }

    .card h1,
    .card h2 {
      margin-bottom: 12px;
    }
  `,
  ],
})
export default class IndexPage {}
