"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NextLink() {
  const pathname = usePathname();

  return (
    <div className="card" id="link-card">
      <h2>next/link</h2>
      <p>
        Client-side navigation with prefetching. Current path: <code>{pathname}</code>
      </p>
      <div className="link-list">
        <Link href="/" className="nav-link">
          Home
        </Link>
        <Link href="/about" className="nav-link">
          About
        </Link>
        <Link
          href="https://github.com/level0x40/virtual-frame"
          className="nav-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub ↗
        </Link>
      </div>
    </div>
  );
}
