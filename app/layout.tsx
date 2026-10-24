import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Santo Gole | Gestão de bebidas",
    template: "%s | Santo Gole",
  },
  description:
    "Controle operacional, estoque, vendas e financeiro para distribuidoras de bebidas.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
