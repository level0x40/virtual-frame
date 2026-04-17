import { A } from "@solidjs/router";

export default function About() {
  return (
    <div
      style={{
        "font-family": "system-ui, sans-serif",
        padding: "24px",
      }}
    >
      <h1>About — Remote SolidStart App</h1>
      <p>
        This page demonstrates client-side navigation inside the remote app. Because the host uses
        the <code>proxy</code> option, data requests issued by the remote's router are routed
        through the host's dev proxy so the projection keeps working across origins.
      </p>
      <nav>
        <A href="/">Home</A>
      </nav>
    </div>
  );
}
