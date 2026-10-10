import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Aangan enquiries", description: "Phone enquiries, leads and reviews for Aangan Studio" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <strong>Aangan enquiries</strong>
          <nav>
            <Link href="/designer">Designer</Link>
            <Link href="/frontdesk">Front desk</Link>
            <Link href="/nikhil">Nikhil</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
