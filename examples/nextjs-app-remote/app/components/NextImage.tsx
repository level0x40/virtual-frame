"use client";

import Image from "next/image";

export function NextImage() {
  return (
    <div className="card" id="image-card">
      <h2>next/image</h2>
      <p>
        Optimized image component with automatic format conversion, lazy loading, and responsive
        sizing.
      </p>
      <div className="image-grid">
        <div className="image-item">
          <Image
            src="https://picsum.photos/seed/vf1/400/300"
            alt="Remote image via next/image"
            width={400}
            height={300}
            style={{ borderRadius: 12, width: "100%", height: "auto" }}
          />
          <span className="image-caption">Remote image (400×300)</span>
        </div>
        <div className="image-item">
          <Image
            src="https://picsum.photos/seed/vf2/400/300"
            alt="Second remote image"
            width={400}
            height={300}
            style={{ borderRadius: 12, width: "100%", height: "auto" }}
            priority
          />
          <span className="image-caption">Priority loaded</span>
        </div>
      </div>
    </div>
  );
}
