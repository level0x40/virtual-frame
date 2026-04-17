import { fetchVirtualFrame, prepareVirtualFrameProps } from "@virtual-frame/next";
import { HostFrames } from "./components/HostFrames";

export const dynamic = "force-dynamic";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3001";

export default async function HostPage() {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  const frameProps = await prepareVirtualFrameProps(frame, { proxy: "/__vf" });
  const counterProps = await prepareVirtualFrameProps(frame, {
    selector: "#counter-card",
    proxy: "/__vf",
  });

  return (
    <>
      <h1>Virtual Frame — Next.js SSR Example</h1>
      <p className="subtitle">
        Two separate Next.js App Router apps: <strong>host</strong> (port 3000) fetches{" "}
        <strong>remote</strong> (port 3001) during SSR, then the VirtualFrame core resumes on the
        client.
      </p>

      <HostFrames frameProps={frameProps} counterProps={counterProps} />
    </>
  );
}
