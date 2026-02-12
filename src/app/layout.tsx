import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IssueLab x SecondMe",
  description: "IssueLab 的 SecondMe 轨迹讨论实验台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
