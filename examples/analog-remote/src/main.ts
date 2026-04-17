import "zone.js";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

// Virtual Frame bridge — auto-initialises when loaded inside an iframe.
// Enables cross-origin DOM mirroring via the postMessage protocol.
import "virtual-frame/bridge";
import "@analogjs/router";
import "./routeTree.gen";

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
