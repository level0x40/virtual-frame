import { Component } from "@angular/core";
import { NavigationComponent } from "../components/navigation.component";

@Component({
  selector: "app-about-page",
  standalone: true,
  imports: [NavigationComponent],
  template: `
    <div class="card" id="info-card">
      <h1>About</h1>
      <p>
        This is a second page in the remote Analog app, demonstrating client-side
        navigation within a <code>&lt;virtual-frame&gt;</code>.
      </p>
      <p>
        Clicking <strong>Home</strong> below navigates back to the main page
        entirely inside the hidden iframe — the host page never reloads.
      </p>
    </div>

    <app-navigation />
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

    .card h1 {
      margin-bottom: 12px;
    }
  `,
  ],
})
export default class AboutPage {}
