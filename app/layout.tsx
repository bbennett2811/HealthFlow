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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Outfit:wght@300;400;600&display=swap" rel="stylesheet" />
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          imports: {
            "@google/generative-ai": "https://esm.run/@google/generative-ai"
          }
        }) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
