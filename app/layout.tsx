import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "世界杯 2026 · 智能比分预测",
  description: "世界杯 2026 智能比分预测",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
