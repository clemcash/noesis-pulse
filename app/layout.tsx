import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Noesis Pulse",
  description: "Suivi en direct de Noesis : activité, utilisateurs, IA et APIs.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
