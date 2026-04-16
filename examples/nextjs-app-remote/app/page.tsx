import { Counter } from "./components/Counter";
import { EchoInput } from "./components/EchoInput";
import { ToggleCheck } from "./components/ToggleCheck";
import { Timestamp } from "./components/Timestamp";
import { NextImage } from "./components/NextImage";
import { NextLink } from "./components/NextLink";
import { NextFont } from "./components/NextFont";
import { NextHead } from "./components/NextHead";
import { NextSuspense } from "./components/NextSuspense";

export default function RemotePage() {
  return (
    <>
      <div className="card" id="info-card">
        <h1>Remote Next.js App</h1>
        <p>
          This page is a standalone Next.js App Router application. During SSR,
          the host app fetches this page and renders it instantly inside a{" "}
          <code>&lt;virtual-frame&gt;</code> — no extra client-side network
          request needed!
        </p>
        <Timestamp />
      </div>

      <Counter />

      <NextImage />

      <NextFont />

      <NextLink />

      <NextHead />

      <NextSuspense />

      <EchoInput />

      <ToggleCheck />
    </>
  );
}
