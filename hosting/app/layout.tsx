import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {title:'Kanade 楽譜スタジオ',description:'友だちと招待リンクで共同編集できる楽譜エディタ'};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
