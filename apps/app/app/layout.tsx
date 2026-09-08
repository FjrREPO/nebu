import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NEBU // AGENTS",
  description: "Agents that work your positions on BNB Smart Chain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={manrope.variable} style={{ colorScheme: "dark" }}>
      <body>
        <div className="relative min-h-screen">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
