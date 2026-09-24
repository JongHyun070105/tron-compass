"use client";

import React, { useState, useEffect } from "react";
import {
  Wallet,
  ShieldCheck,
  Globe,
  Radio,
  ExternalLink,
  ChevronDown,
  Sparkles,
} from "lucide-react";

export interface WalletState {
  isConnected: boolean;
  address: string;
  network: string;
  trxBalance: string;
  usddBalance: string;
  isDemoMode: boolean;
}

interface WalletHeaderProps {
  walletState: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleDemoMode: () => void;
}

export function WalletHeader({
  walletState,
  onConnect,
  onDisconnect,
  onToggleDemoMode,
}: WalletHeaderProps) {
  const [hasTronLink, setHasTronLink] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).tronWeb) {
      setHasTronLink(true);
    }
  }, []);

  return (
    <header className="border-b border-gray-800 bg-[#0B0F19]/90 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Tagline */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/30 text-white font-bold text-lg">
              ▲
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-white">
                  TRON Compass
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-800/60 font-medium">
                  GWDC 2026 Challenge B
                </span>
              </div>
              <p className="text-xs text-gray-400 hidden sm:block">
                AI Asset Allocation & Yield Planning Assistant
              </p>
            </div>
          </div>

          {/* Quick Demo Switcher on mobile */}
          <button
            onClick={onToggleDemoMode}
            className="md:hidden text-xs px-2.5 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            {walletState.isDemoMode ? "Live 지갑" : "데모 모드"}
          </button>
        </div>

        {/* Network & Source Badges (Mandatory Requirement) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-blue-950/60 border border-blue-800/50 text-blue-300 px-2.5 py-1 rounded-md">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Market Data:</span>
            <strong className="text-blue-200">TRON Mainnet</strong>
          </div>

          <div className="flex items-center gap-1.5 bg-purple-950/60 border border-purple-800/50 text-purple-300 px-2.5 py-1 rounded-md">
            <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span>Execution:</span>
            <strong className="text-purple-200">Nile Testnet</strong>
          </div>
        </div>

        {/* Wallet Connection & Balances */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={onToggleDemoMode}
            className="hidden md:flex text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 bg-gray-900 text-gray-300 hover:text-white items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            {walletState.isDemoMode ? "데모 모드 활성" : "데모 모드 전환"}
          </button>

          {walletState.isConnected ? (
            <div className="flex items-center gap-2.5 bg-gray-900 border border-gray-800 rounded-lg p-1.5 pr-3">
              <div className="px-2.5 py-1 bg-gray-800/80 rounded text-xs font-mono text-gray-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>
                  {walletState.address.slice(0, 5)}...{walletState.address.slice(-4)}
                </span>
                {walletState.isDemoMode && (
                  <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-1 rounded">
                    DEMO
                  </span>
                )}
              </div>

              <div className="text-xs text-right hidden sm:block">
                <div className="text-white font-medium">
                  {walletState.trxBalance} TRX
                </div>
                <div className="text-gray-400 text-[11px]">
                  {walletState.usddBalance} USDD
                </div>
              </div>

              <button
                onClick={onDisconnect}
                className="text-xs text-gray-400 hover:text-red-400 ml-1 px-1.5 py-1 hover:bg-gray-800 rounded transition-colors"
                title="Disconnect"
              >
                해제
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              className="bg-red-600 hover:bg-red-500 text-white font-medium text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-md shadow-red-900/30 transition-colors"
            >
              <Wallet className="w-4 h-4" />
              <span>지갑 연결 (TronLink)</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
