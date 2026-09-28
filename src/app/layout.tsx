import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "TRON Compass — Verifiable Yield Decisions",
  description:
    "TRON Compass turns a conversation about your money into a yield decision that can be verified before signing and re-checked when its assumptions change.",
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
