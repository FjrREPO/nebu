import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Nav } from "@/components/nav";
import { SITE, TAGLINE } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  // Every other URL in the app's metadata is written relative to this.
  metadataBase: SITE,
  title: {
    default: "Nebu — autonomous DeFi agents for BNB Smart Chain",
    // Pages set the short half; the brand belongs on the end, where a search
    // result truncates last.
    template: "%s — Nebu",
  },
  description: TAGLINE,
  applicationName: "Nebu",
  keywords: [
    "BNB Smart Chain",
    "BNB Chain agents",
    "DeFi agent marketplace",
    "PancakeSwap V3 rebalancing",
    "grid trading bot",
    "yield optimiser",
    "Aave health factor",
    "session keys",
    "autonomous agents",
  ],
  authors: [{ name: "Nebu" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Nebu",
    url: "/",
    title: "Nebu — autonomous DeFi agents for BNB Smart Chain",
    description: TAGLINE,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nebu — autonomous DeFi agents for BNB Smart Chain",
    description: TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  category: "finance",
};

/** What the site is, for the engines that read it as data rather than prose. */
const organisation = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Nebu",
  url: SITE.href,
  description: TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={manrope.variable} style={{ colorScheme: "dark" }}>
      <body>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other way in
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisation) }}
        />
        <div className="relative min-h-screen">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
