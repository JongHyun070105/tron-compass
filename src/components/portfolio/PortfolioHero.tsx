"use client";

import React from "react";
import { WalletState } from "@/components/wallet/WalletHeader";
import { NeedsProfile } from "@/domain/allocation/types";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

interface PortfolioHeroProps {
  walletState: WalletState;
  jTrxBalance: string | null;
  profile: NeedsProfile;
  onExplorePlans: () => void;
  onOpenGoals: () => void;
  hasPlans: boolean;
}

export function PortfolioHero({
  walletState,
  jTrxBalance,
  profile,
  onExplorePlans,
  onOpenGoals,
  hasPlans,
}: PortfolioHeroProps) {
  const riskKoreanMap: Record<string, string> = {
    LOW: "저위험",
    MEDIUM: "중위험",
    HIGH: "고위험",
  };

  const riskLabel = riskKoreanMap[profile.riskLevel] || "저위험";

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
      {/* Background soft ambient gradient */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-red-50/50 via-rose-50/30 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Left: Main Balance & Goal Info */}
        <div className="space-y-4 max-w-xl">
          {/* User Mode Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80">
            <span
              className={`w-2 h-2 rounded-full ${
                walletState.isDemoMode ? "bg-amber-500" : "bg-emerald-500"
              }`}
            ></span>
            <span>
              {walletState.isDemoMode
                ? "체험용 가상 포트폴리오"
                : "실제 TronLink 지갑 연결됨"}
            </span>
          </div>

          {/* Primary Numbers */}
          <div>
            <span className="text-sm font-medium text-slate-500 block mb-1">
              지갑 토큰 잔액
            </span>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 font-mono">
                {walletState.trxBalance === "UNAVAILABLE" ? "UNAVAILABLE" : `${walletState.trxBalance} TRX`}
              </span>
              <span className="text-lg sm:text-xl font-semibold text-slate-400 font-mono">
                {walletState.network.toLowerCase().includes("nile")
                  ? jTrxBalance === null ? "jTRX UNAVAILABLE" : `+ ${jTrxBalance} jTRX`
                  : "jTRX unavailable · connect Nile"}
              </span>
              {walletState.isDemoMode && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                  SIMULATED · demo balances
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {walletState.isDemoMode
                ? "SIMULATED wallet values and portfolio values are demo fixtures, not chain observations."
                : `Connected-wallet balances are execution capacity only (${walletState.network}); they are not included in the hypothetical planning portfolio.`}
            </p>
            <p className="text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              Planning assets are USER_DECLARED hypothetical Mainnet quantities. JustLend LIVE_MAINNET prices produce USDT-equivalent values; Nile balances are used only for testnet execution.
            </p>
          </div>

          {/* Short Goal Summary */}
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 bg-slate-50 border border-slate-200/70 px-4 py-2.5 rounded-2xl w-fit">
            <span className="font-semibold text-slate-900">설정된 목표:</span>
            <span>
              {profile.horizonDays}일 운용 · {riskLabel} · 최소 비상금 {profile.minimumLiquidUsdtEquivalent} USDT-equivalent
            </span>
            <button
              onClick={onOpenGoals}
              className="text-red-600 hover:text-red-700 font-semibold ml-2 underline underline-offset-2 transition-colors cursor-pointer"
            >
              목표 변경
            </button>
          </div>
        </div>

        {/* Right: Primary Call to Action */}
        <div className="w-full md:w-auto flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
          <button
            onClick={onExplorePlans}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-500 text-white font-bold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2.5 shadow-sm shadow-red-600/20 transition-all active:scale-[0.98] cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{hasPlans ? "추천 플랜 비교하기" : "AI 플랜 만들기"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>상환은 풀 유동성에 따름</span>
            </span>
            <span>•</span>
            <span>네트워크 수수료 발생 가능</span>
          </div>
        </div>
      </div>
    </div>
  );
}
