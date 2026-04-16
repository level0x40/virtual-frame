import { NextLink } from "../components/NextLink";

export default function AboutPage() {
  return (
    <>
      <div className="card" id="info-card">
        <h1>About</h1>
        <p>
          This is a second page in the remote Next.js app, demonstrating
          client-side navigation within a <code>&lt;virtual-frame&gt;</code>.
        </p>
        <p>
          Clicking <strong>Home</strong> below navigates back to the main page
          entirely inside the hidden iframe — the host page never reloads.
        </p>
      </div>

      <NextLink />
    </>
  );
}
