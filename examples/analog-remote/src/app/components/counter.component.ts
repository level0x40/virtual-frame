import { Component } from "@angular/core";
import {
  injectStore,
  injectStoreValue,
} from "@virtual-frame/analog/store";

@Component({
  selector: "app-counter",
  standalone: true,
  template: `
    <div class="card" id="counter-card">
      <h2>Counter</h2>
      <div class="counter">{{ count() ?? 0 }}</div>
      <div class="buttons">
        <button (click)="decrement()">- Decrement</button>
        <button (click)="increment()">+ Increment</button>
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
    .counter {
      font-size: 48px;
      font-weight: bold;
      text-align: center;
      margin: 16px 0;
    }
    .buttons {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #fff;
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: rgba(255, 255, 255, 0.35);
    }
  `,
  ],
})
export class CounterComponent {
  store = injectStore();
  count = injectStoreValue<number>(this.store, ["count"]);

  increment() {
    this.store.count = (this.count() ?? 0) + 1;
  }

  decrement() {
    this.store.count = (this.count() ?? 0) - 1;
  }
}
