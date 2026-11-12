import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBR Inplanner",
  description: "Examens inplannen voor rijscholen via de CBR Opleiders API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
