import { createFileRoute } from "@tanstack/react-router";
import { Counter } from "../components/Counter";
import { EchoInput } from "../components/EchoInput";
import { ToggleCheck } from "../components/ToggleCheck";
import { Timestamp } from "../components/Timestamp";

export const Route = createFileRoute("/")({
  component: RemotePage,
});

function RemotePage() {
  return (
    <>
      <div className="card" id="info-card">
        <h1>🚀 Remote TanStack Start App</h1>
        <p>
          This page is a standalone TanStack Start application. During SSR, the
          host app fetches this page and renders it instantly inside a virtual
          frame — no extra client-side network request needed!
        </p>
        <Timestamp />
      </div>

      <Counter />

      <EchoInput />

      <ToggleCheck />
    </>
  );
}
