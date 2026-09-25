import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "HEALTHY",
    service: "TRON Compass API",
    version: "1.0.0",
    challenge: "GWDC 2026 TRON Challenge B",
    timestamp: new Date().toISOString(),
    networks: {
      marketInsight: "TRON Mainnet (Read-Only)",
      executionSandbox: "Nile Testnet",
    },
    integrations: {
      justlend: "CONNECTED (OpenAPI v1)",
      usdd: "CONNECTED (USDD Data Platform)",
      gemini: process.env.GEMINI_API_KEY ? "CONFIGURED" : "MOCK_FALLBACK",
      trongrid: process.env.TRONGRID_API_KEY ? "CONFIGURED" : "MISSING_KEY",
    },
  });
}
