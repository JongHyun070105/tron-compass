"use client";

import React from "react";
import {
  Wallet,
  Globe,
  Radio,
  Sparkles,
  LogOut,
  ChevronRight,
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
    <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 transition-colors">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center shadow-sm text-white font-black text-lg select-none">
            ▲
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-slate-900">
                TRON Compass
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              AI 자산 배분 & 수익 계획
            </p>
          </div>
        </div>

        {/* Center: Essential Trust Badges (Compact & Calm) */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-100/80 text-slate-600 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span>Mainnet 시장 데이터</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100/80 text-slate-600 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Nile 실행 검증</span>
          </div>
        </div>

        {/* Right: Mode Switcher & Wallet Status */}
        <div className="flex items-center gap-3">
          {/* Segmented Mode Control */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 text-xs font-medium">
            <button
              onClick={() => {
                if (!walletState.isDemoMode) onToggleDemoMode();
              }}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                walletState.isDemoMode
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>체험 모드</span>
            </button>
            <button
              onClick={() => {
                if (walletState.isDemoMode) onToggleDemoMode();
              }}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                !walletState.isDemoMode
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Wallet className="w-3 h-3 text-red-500" />
              <span>실제 지갑</span>
            </button>
          </div>

          {/* Connected Wallet Badge or Connect Button */}
          {walletState.isConnected ? (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 pl-3 shadow-2xs">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-slate-700 font-mono font-medium">
                  {walletState.address.slice(0, 5)}...{walletState.address.slice(-4)}
                </span>
                <span className="text-slate-900 font-bold font-mono pl-1 border-l border-slate-200">
                  {walletState.trxBalance} TRX
                </span>
              </div>

              <button
                onClick={onDisconnect}
                className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors ml-1"
                title="연결 해제"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs transition-all active:scale-[0.98]"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>지갑 연결하기</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
