import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sky ResQ — Ground Control Station",
  description:
    "Enterprise-grade drone GCS dashboard for real-time telemetry, mapping, and flight control.",
  icons: {
    icon: "/icon skyresq.png",
    apple: "/icon skyresq.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
