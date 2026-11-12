import type { Metadata } from "next";
import Link from "next/link";
import { isMock } from "@/lib/cbr";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBR Inplanner",
  description: "Examens inplannen voor rijscholen via de CBR Opleiders API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <header className="nav">
          <div className="in">
            <strong>CBR Inplanner</strong>
            <Link href="/">Overzicht</Link>
            <Link href="/plannen">Examen inplannen</Link>
            <Link href="/reserveringen">Reserveringen</Link>
            <Link href="/leerlingen">Leerlingen</Link>
          </div>
        </header>
        <main>
          {isMock() && (
            <div className="banner">
              Demomodus: er wordt niet met het echte CBR gesproken. Gegevens zijn fictief.
            </div>
          )}
          {children}
        </main>
      </body>
    </html>
  );
}
