import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "TRON Compass — AI Asset Allocation & Yield Planning Assistant",
  description:
    "GWDC 2026 TRON Challenge B: Convert user needs into evidence-based TRON yield plans using JustLend & USDD data, executing only user-approved actions on Nile testnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="bg-[#0B0F19] text-gray-100 min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
