import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwIRL | Hands-on STEM for curious minds",
  description: "Explore digital STEM curriculum for educators, programs, and families. Five subjects. Hands-on discoveries. Everyday materials.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
