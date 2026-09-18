import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ascend OS — Personal Command Center",
  description: "A private operating system for wealth, routines, and personal growth.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
