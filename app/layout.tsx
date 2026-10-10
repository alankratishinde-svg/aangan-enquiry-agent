import type { Metadata } from "next";
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
            <a href="/#overview">This week</a>
            <a href="/#leads">Leads</a>
            <a href="/#review">Needs review</a>
            <a href="/#callbacks">Callbacks</a>
            <a href="/#rubric">Rubric</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
