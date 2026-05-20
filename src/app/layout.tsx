import type { Metadata } from "next";
import { Playfair_Display, Lato } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--playfair-font",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--lato-font",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const names = process.env.COUPLE_NAMES ?? "Los Novios";
  return {
    title: `Boda de ${names}`,
    description: `Comparte tus fotos de la boda de ${names}`,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${playfair.variable} ${lato.variable}`}>
      <body className="bg-cream text-dark antialiased font-lato">{children}</body>
    </html>
  );
}
