"use client";

import { useEffect, useState } from "react";

export function NextHead() {
  const [meta, setMeta] = useState<{
    title: string;
    description: string;
    viewport: string;
  } | null>(null);

  useEffect(() => {
    setMeta({
      title: document.title,
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ?? "—",
      viewport:
        document
          .querySelector('meta[name="viewport"]')
          ?.getAttribute("content") ?? "—",
    });
  }, []);

  return (
    <div className="card" id="head-card">
      <h2>Metadata API</h2>
      <p>
        Next.js Metadata API sets <code>&lt;head&gt;</code> tags via the{" "}
        <code>metadata</code> export in server components.
      </p>
      {meta && (
        <div className="meta-list">
          <div className="meta-item">
            <span className="meta-key">title</span>
            <span className="meta-value">{meta.title}</span>
          </div>
          <div className="meta-item">
            <span className="meta-key">description</span>
            <span className="meta-value">{meta.description}</span>
          </div>
          <div className="meta-item">
            <span className="meta-key">viewport</span>
            <span className="meta-value">{meta.viewport}</span>
          </div>
        </div>
      )}
    </div>
  );
}
