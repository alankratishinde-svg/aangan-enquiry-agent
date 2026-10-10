import type { Metadata } from "next";
import Link from "next/link";
import { openAccess } from "../src/server/session";
import "./globals.css";

export const metadata: Metadata = { title: "Aangan Studio", description: "Phone enquiries, leads and reviews for Aangan Studio" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand"><strong>Aangan Studio</strong></Link>
          <nav>
            <Link href="/designer">Designer dashboard</Link>
            <Link href="/nikhil">Nikhil dashboard</Link>
          </nav>
        </header>
        {openAccess() && <div className="testbar" role="note">Test mode: no sign-in</div>}
        <main>{children}</main>
      </body>
    </html>
  );
}
