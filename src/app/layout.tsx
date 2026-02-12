import type { Metadata } from "next";
import { Noto_Sans_SC, Space_Grotesk } from "next/font/google";
import "./globals.css";

const bodyFont = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "IssueLab x SecondMe",
  description: "IssueLab 的 SecondMe 轨迹讨论实验台",
  openGraph: {
    title: "IssueLab x SecondMe",
    description: "IssueLab 的 SecondMe 轨迹讨论实验台",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: "IssueLab x SecondMe",
    description: "IssueLab 的 SecondMe 轨迹讨论实验台",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>{children}</body>
    </html>
  );
}
