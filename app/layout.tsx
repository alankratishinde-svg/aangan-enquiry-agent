import type { Metadata } from "next";
import { Cormorant_Garamond, Poppins } from "next/font/google";
import { openAccess } from "../src/server/session";
import { TopBar } from "./_components/TopBar";
import "./globals.css";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-display", display: "swap" });
const ui = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = { title: "Aangan Studio", description: "Phone enquiries, leads and reviews for Aangan Studio" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body>
        <TopBar />
        {openAccess() && <p className="testnote" role="note">Test mode: no sign-in</p>}
        <main>{children}</main>
      </body>
    </html>
  );
}
