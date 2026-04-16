import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Virtual Frame — react-server SSR Host</title>
        <meta
          name="description"
          content="Host app that embeds a remote react-server app via virtual-frame SSR"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
