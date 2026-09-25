"use client";

import React from "react";
import {
  Wallet,
  Globe,
  Radio,
  Sparkles,
  LogOut,
  Layers,
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
  return (
    <header className="border-b border-gray-800/90 bg-[#0B0F19]/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3">
      <div className="max-w-[1240px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3.5">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shadow-md shadow-red-900/40 text-white font-black text-base">
              ▲
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  TRON Compass
                </span>
                <span className="text-[10px] text-gray-500 hidden sm:inline-block border border-gray-800 rounded px-1.5 py-0.5">
                  GWDC 2026 Challenge B
                </span>
              </div>
              <p className="text-[11px] text-gray-400 hidden sm:block">
                AI Asset Allocation & Yield Planning
              </p>
            </div>
          </div>

          {/* Mobile mode switch button */}
          <button
            onClick={onToggleDemoMode}
            className="md:hidden text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-300 flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>{walletState.isDemoMode ? "실제 지갑 전환" : "데모 모드"}</span>
          </button>
        </div>

        {/* Mandatory Network & Data Badges */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-blue-950/50 border border-blue-800/50 text-blue-300 px-2.5 py-1 rounded-lg">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-gray-400 text-[11px]">데이터:</span>
            <strong className="text-blue-200">TRON Mainnet</strong>
          </div>

          <div className="flex items-center gap-1.5 bg-purple-950/50 border border-purple-800/50 text-purple-300 px-2.5 py-1 rounded-lg">
            <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span className="text-gray-400 text-[11px]">실행:</span>
            <strong className="text-purple-200">Nile Testnet</strong>
          </div>
        </div>

        {/* Right: Portfolio Switcher & Wallet Connection */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Mutually Exclusive Mode Switcher */}
          <div className="hidden md:flex items-center bg-gray-950 border border-gray-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => {
                if (!walletState.isDemoMode) onToggleDemoMode();
              }}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 ${
                walletState.isDemoMode
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>데모 포트폴리오</span>
            </button>
            <button
              onClick={() => {
                if (walletState.isDemoMode) onToggleDemoMode();
              }}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 ${
                !walletState.isDemoMode
                  ? "bg-purple-900/40 text-purple-300 border border-purple-700/50"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Wallet className="w-3 h-3" />
              <span>실제 지갑 (Real)</span>
            </button>
          </div>

          {/* Wallet State Card */}
          {walletState.isConnected ? (
            <div className="flex items-center gap-2.5 bg-gray-900 border border-gray-800 rounded-xl p-1.5 pl-3">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-gray-200">
                  {walletState.address.slice(0, 5)}...{walletState.address.slice(-4)}
                </span>
                {walletState.isDemoMode && (
                  <span className="text-[10px] font-sans font-bold bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.2 rounded">
                    DEMO
                  </span>
                )}
              </div>

              {/* Balances */}
              <div className="text-right text-xs px-1 border-l border-gray-800/80">
                <div className="text-white font-semibold font-mono">
                  {walletState.trxBalance} TRX
                </div>
              </div>

              <button
                onClick={onDisconnect}
                className="text-gray-400 hover:text-red-400 p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
                title="연결 해제"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-md shadow-red-900/30 transition-colors"
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
