import { Component } from "@angular/core";
import { NgFor, NgStyle } from "@angular/common";
import { VirtualFrameDirective } from "@virtual-frame/angular";

interface Page {
  label: string;
  src: string;
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [NgFor, NgStyle, VirtualFrameDirective],
  template: `
    <div style="font-family: system-ui, sans-serif; margin: 20px">
      <h1>Virtual Frame — Angular Example</h1>
      <p>This example uses <code>@virtual-frame/angular</code> to mirror pages into a shadow DOM.</p>

      <nav style="display: flex; gap: 8px; margin-bottom: 16px">
        <button
          *ngFor="let p of pages"
          (click)="current = p"
          [ngStyle]="{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            background: current === p ? '#007acc' : '#fff',
            color: current === p ? '#fff' : '#333',
            cursor: 'pointer',
          }"
        >
          {{ p.label }}
        </button>
      </nav>

      <div
        virtualFrame
        [src]="current.src"
        style="border: 2px dashed #007acc; border-radius: 8px; min-height: 400px"
      ></div>
    </div>
  `,
})
export class AppComponent {
  pages: Page[] = [
    { label: "Hello", src: "/hello.html" },
    { label: "Forms", src: "/forms.html" },
    { label: "SVG", src: "/svg.html" },
    { label: "Media", src: "/media.html" },
  ];

  current: Page = this.pages[0];
}
