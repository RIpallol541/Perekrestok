import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Перекрёсток — интерактивный редактор дорог",
  description: "Гибкий конструктор перекрёстков, полос, трамвайных путей и дорожной разметки ПДД РФ.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
