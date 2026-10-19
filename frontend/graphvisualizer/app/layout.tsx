import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graph Visualizer",
  description: "Визуализация алгоритмов на графах",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`h-full antialiased`}>
      <body  className={`font-sans antialiased`}>{children}</body>
    </html>
  );
}
