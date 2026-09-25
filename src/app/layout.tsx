import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "TRON Compass — AI 자산 배분 & 수익 플래너",
  description:
    "누구나 10초 만에 이해하는 TRON 스마트 자산 배분 및 JustLend 수익 계획 도우미",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased selection:bg-red-500 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
