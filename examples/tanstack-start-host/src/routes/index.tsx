import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
} from "@virtual-frame/tanstack-start/server";
import { HostFrames } from "../components/HostFrames";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3005";

const loadFrames = createServerFn().handler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);

  return {
    fullFrame: await prepareVirtualFrameProps(frame),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
});

export const Route = createFileRoute("/")({
  loader: () => loadFrames(),
  component: HostPage,
});

function HostPage() {
  const { fullFrame, counterFrame } = Route.useLoaderData();

  return (
    <>
      <h1>Virtual Frame — TanStack Start SSR Example</h1>
      <p className="subtitle">
        Two separate TanStack Start apps: <strong>host</strong> (port 3004)
        fetches <strong>remote</strong> (port 3005) during SSR via a route{" "}
        <code>loader</code>, then the VirtualFrame core mirrors on the client.
      </p>

      <HostFrames frameProps={fullFrame} counterProps={counterFrame} />
    </>
  );
}
