import "zone.js/node";
import "@angular/platform-server/init";

import { enableProdMode, mergeApplicationConfig } from "@angular/core";
import { renderApplication } from "@angular/platform-server";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app/app.component";
import { config } from "./app/app.config.server";
import { FRAME_DATA } from "./app/frame-data";

const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://localhost:3011";
const PROXY = "/__vf";

if (import.meta.env.PROD) {
  enableProdMode();
}

export default async function render(url: string, document: string) {
  // Fetch frame data from the remote BEFORE Angular renders,
  // so the SSR output includes the declarative shadow DOM.
  const { fetchVirtualFrame, prepareVirtualFrameProps } =
    await import("@virtual-frame/analog/server");
  const frame = await fetchVirtualFrame(REMOTE_URL);
  const frameData = {
    fullFrame: await prepareVirtualFrameProps(frame, { proxy: PROXY }),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
      proxy: PROXY,
    }),
  };

  const ssrConfig = mergeApplicationConfig(config, {
    providers: [{ provide: FRAME_DATA, useValue: frameData }],
  });

  const html = await renderApplication(
    (ctx) => bootstrapApplication(AppComponent, ssrConfig, ctx),
    { document, url },
  );
  return html;
}
