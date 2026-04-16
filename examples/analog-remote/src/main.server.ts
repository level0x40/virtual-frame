import "zone.js/node";
import "@angular/platform-server/init";

import { enableProdMode } from "@angular/core";
import { renderApplication } from "@angular/platform-server";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app/app.component";
import { config } from "./app/app.config.server";

if (import.meta.env.PROD) {
  enableProdMode();
}

export default async function render(url: string, document: string) {
  const html = await renderApplication(
    (ctx) => bootstrapApplication(AppComponent, config, ctx),
    { document, url },
  );
  return html;
}
