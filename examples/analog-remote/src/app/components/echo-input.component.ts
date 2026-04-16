import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-echo-input",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card" id="echo-card">
      <h2>Echo Input</h2>
      <input
        type="text"
        [(ngModel)]="text"
        placeholder="Type here..."
      />
      <p class="echo">{{ text || "..." }}</p>
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
    input[type="text"] {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      font-size: 14px;
      outline: none;
      margin-bottom: 8px;
    }
    input[type="text"]::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }
    input[type="text"]:focus {
      border-color: rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.18);
    }
    .echo {
      font-style: italic;
      opacity: 0.8;
    }
  `,
  ],
})
export class EchoInputComponent {
  text = "";
}
