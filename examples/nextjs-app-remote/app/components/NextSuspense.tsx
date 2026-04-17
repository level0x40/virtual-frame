import { Suspense } from "react";

async function SlowData() {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return (
    <div className="suspense-loaded">
      Data loaded after 1s delay — streamed into the page via React Suspense.
    </div>
  );
}

function LoadingFallback() {
  return <div className="suspense-loading">Loading async data…</div>;
}

export function NextSuspense() {
  return (
    <div className="card" id="suspense-card">
      <h2>React Suspense + Streaming</h2>
      <p>
        Server Component with async data wrapped in <code>&lt;Suspense&gt;</code> — the fallback
        streams first, then the resolved content replaces it.
      </p>
      <Suspense fallback={<LoadingFallback />}>
        <SlowData />
      </Suspense>
    </div>
  );
}
