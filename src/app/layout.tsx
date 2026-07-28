import type { Metadata } from "next";
import "./globals.css";

// Usamos a stack de fontes do sistema (ver globals.css) em vez de
// next/font/google: evita uma dependência de rede externa em build time
// (Google Fonts), o que deixa o build mais rápido e resiliente em
// qualquer ambiente de CI/deploy -- inclusive redes restritas.

export const metadata: Metadata = {
  title: "Cad RD",
  description: "Editor CAD 2D para desenho de diagramas unifilares elétricos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
