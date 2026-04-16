import Head from "next/head";
import { Counter } from "../components/Counter";
import { EchoInput } from "../components/EchoInput";
import { ToggleCheck } from "../components/ToggleCheck";
import { Timestamp } from "../components/Timestamp";

export default function RemotePage() {
  return (
    <>
      <Head>
        <title>Remote App — Virtual Frame (Pages Router)</title>
        <meta
          name="description"
          content="A Next.js Pages Router remote app embedded via virtual-frame SSR"
        />
      </Head>

      <div className="card" id="info-card">
        <h1>🚀 Remote Next.js App (Pages Router)</h1>
        <p>
          This page is a standalone Next.js <strong>Pages Router</strong>{" "}
          application. During SSR, the host app fetches this page and renders it
          instantly inside a virtual frame — no extra client-side network
          request needed!
        </p>
        <Timestamp />
      </div>

      <Counter />

      <EchoInput />

      <ToggleCheck />
    </>
  );
}
