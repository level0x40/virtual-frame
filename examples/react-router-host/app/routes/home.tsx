import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
} from "@virtual-frame/react-router/server";
import { HostFrames } from "../components/HostFrames";
import type { Route } from "./+types/home";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3007";

export async function loader() {
  const frame = await fetchVirtualFrame(REMOTE_URL);

  return {
    fullFrame: await prepareVirtualFrameProps(frame),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
}

export default function HostPage({ loaderData }: Route.ComponentProps) {
  const { fullFrame, counterFrame } = loaderData;

  return (
    <>
      <h1>Virtual Frame — React Router SSR Example</h1>
      <p className="subtitle">
        Two separate React Router apps: <strong>host</strong> (port 3006)
        fetches <strong>remote</strong> (port 3007) during SSR via a route{" "}
        <code>loader</code>, then the VirtualFrame core mirrors on the client.
      </p>

      <HostFrames frameProps={fullFrame} counterProps={counterFrame} />
    </>
  );
}
