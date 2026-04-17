import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-toggle-check",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card" id="toggle-card">
      <h2>Toggle Checkbox</h2>
      <label class="checkbox-label">
        <input type="checkbox" [(ngModel)]="checked" />
        Toggle me
      </label>
      <p>{{ checked ? "Checked" : "Unchecked" }}</p>
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
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
    `,
  ],
})
export class ToggleCheckComponent {
  checked = false;
}
