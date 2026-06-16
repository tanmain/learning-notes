import type { Metadata } from "next";
import { Cormorant_Garamond, Jost, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});
const jost = Jost({ variable: "--font-jost", subsets: ["latin"], display: "swap" });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], display: "swap" });
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DDIA Interactive — Designing Data-Intensive Applications",
    template: "%s · DDIA Interactive",
  },
  description:
    "An interactive companion to Designing Data-Intensive Applications — explanations, live demos, analogies, real-world examples, and an AI tutor for every chapter.",
};

// Applies the saved theme before paint to avoid a flash. Default is dark.
const themeScript = `(function(){try{if(localStorage.getItem('ddia-theme')==='light')document.documentElement.classList.add('light');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${jost.variable} ${archivo.variable} ${plexMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <SiteNav />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
