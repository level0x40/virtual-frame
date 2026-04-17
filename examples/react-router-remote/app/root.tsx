import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { LinksFunction } from "react-router";

// Virtual Frame bridge — auto-initialises when loaded inside an iframe
// (window.parent !== window).  Enables cross-origin DOM mirroring via
// the postMessage protocol.  When loaded standalone (not in an iframe),
// the auto-init check skips and the import is a no-op.
import "virtual-frame/bridge";

import appCss from "./styles/globals.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: appCss }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="A React Router remote app embedded via virtual-frame SSR"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
