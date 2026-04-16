import type { InferGetServerSidePropsType, GetServerSideProps } from "next";
import Head from "next/head";
import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
  VirtualFrame,
} from "@virtual-frame/next";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3017";

interface PageProps {
  fullFrame: { _vfId: string; src: string; isolate: "open" | "closed" };
  counterFrame: {
    _vfId: string;
    src: string;
    isolate: "open" | "closed";
    selector?: string;
  };
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);

  return {
    props: {
      fullFrame: await prepareVirtualFrameProps(frame),
      counterFrame: await prepareVirtualFrameProps(frame, {
        selector: "#counter-card",
      }),
    },
  };
};

export default function HostPage({
  fullFrame,
  counterFrame,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>Virtual Frame — Next.js Pages Router SSR Host</title>
        <meta
          name="description"
          content="Host app that embeds a remote Next.js app via virtual-frame SSR (Pages Router)"
        />
      </Head>

      <h1>Virtual Frame — Next.js Pages Router SSR Example</h1>
      <p className="subtitle">
        Two separate Next.js <strong>Pages Router</strong> apps:{" "}
        <strong>host</strong> (port 3002) fetches <strong>remote</strong> (port
        3003) during SSR via <code>getServerSideProps</code>, then the
        VirtualFrame core resumes on the client.
      </p>

      <div className="layout">
        <div className="panel info">
          <strong>How it works:</strong> The host calls{" "}
          <code>fetchVirtualFrame()</code> in <code>getServerSideProps</code> to
          fetch the remote Pages Router page during SSR.{" "}
          <code>prepareVirtualFrameProps()</code> extracts the serialisable
          props for the client. Two <code>&lt;VirtualFrame&gt;</code>{" "}
          components are rendered — one showing the full page, one showing only{" "}
          <code>#counter-card</code>. On the client, both components{" "}
          <strong>share a single hidden iframe</strong> (ref-counted). The
          diff-based resume delta reconstructs the full page from the shadow DOM
          content — zero extra network requests.
        </div>

        <div className="panel">
          <h2>Full Remote App (no selector)</h2>
          <VirtualFrame {...fullFrame} />
        </div>

        <div className="panel">
          <h2>
            Counter Card Only (selector: <code>#counter-card</code>)
          </h2>
          <VirtualFrame {...counterFrame} />
        </div>
      </div>
    </>
  );
}
