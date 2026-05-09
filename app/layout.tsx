import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealthFlow | Personal Health Dashboard",
  description: "Your weightless personal health companion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Outfit:wght@400;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#f8fafc', margin: 0, minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
