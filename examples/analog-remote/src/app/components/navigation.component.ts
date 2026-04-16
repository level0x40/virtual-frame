import { Component } from "@angular/core";
import { Router, RouterLink } from "@angular/router";

@Component({
  selector: "app-navigation",
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="card" id="link-card">
      <h2>Router Links</h2>
      <p>
        Client-side navigation with Angular Router. Current path:
        <code>{{ currentPath }}</code>
      </p>
      <div class="link-list">
        <a routerLink="/" class="nav-link">Home</a>
        <a routerLink="/about" class="nav-link">About</a>
        <a
          href="https://github.com/level0x40/virtual-frame"
          class="nav-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub &#x2197;
        </a>
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
    h2 { margin-bottom: 12px; }
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
    .link-list {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .nav-link {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      text-decoration: none;
      font-size: 14px;
      transition: background 0.2s;
    }
    .nav-link:hover {
      background: rgba(255, 255, 255, 0.35);
    }
  `,
  ],
})
export class NavigationComponent {
  currentPath: string;

  constructor(private router: Router) {
    this.currentPath = this.router.url;
    this.router.events.subscribe(() => {
      this.currentPath = this.router.url;
    });
  }
}
