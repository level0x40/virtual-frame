import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles/globals.css?url";

// Virtual Frame bridge — auto-initialises when loaded inside an iframe
// (window.parent !== window).  Enables cross-origin DOM mirroring via
// the postMessage protocol.  When loaded standalone (not in an iframe),
// the auto-init check skips and the import is a no-op.
import "virtual-frame/bridge";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content: "A TanStack Start remote app embedded via virtual-frame SSR",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: () => <p>Page not found</p>,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
