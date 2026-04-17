import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Remote App — Virtual Frame</title>
        <meta
          name="description"
          content="A react-server remote app embedded via virtual-frame SSR"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
