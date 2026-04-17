import { fetchVirtualFrame } from "@virtual-frame/react-server";
import { prepareVirtualFrameProps } from "@virtual-frame/react-server/cache";
import { HostFrames } from "./components/HostFrames";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3003";

export default async function HostPage() {
  const frame = await fetchVirtualFrame(REMOTE_URL);

  const fullPage = await prepareVirtualFrameProps(frame);
  const counterCard = await prepareVirtualFrameProps(frame, {
    selector: "#counter-card",
  });

  return (
    <>
      <h1>Virtual Frame — react-server SSR Example</h1>
      <p className="subtitle">
        Two separate <code>@lazarv/react-server</code> apps: <strong>host</strong> (port 3002)
        fetches <strong>remote</strong> (port 3003) during SSR, then the VirtualFrame core resumes
        on the client.
      </p>

      <HostFrames fullPage={fullPage} counterCard={counterCard} />
    </>
  );
}
