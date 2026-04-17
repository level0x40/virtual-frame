import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remote App — Virtual Frame",
  description: "A Next.js remote app embedded via virtual-frame SSR",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
