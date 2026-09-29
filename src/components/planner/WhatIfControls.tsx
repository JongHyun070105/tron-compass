"use client";

import React from "react";
import { NeedsProfile, AllocationPlan, RiskLevel } from "@/domain/allocation/types";
import {
  Sliders,
  Shield,
  Target,
  Calendar,
  Sparkles,
  Zap,
  TrendingUp,
  DollarSign,
  Info,
} from "lucide-react";
import { getValuationStatus, hasCompleteValuation } from "@/domain/allocation/valuation";

interface WhatIfControlsProps {
  profile: NeedsProfile;
  totalCapitalUsdtEquivalent?: string;
  totalPortfolioUsdtEquivalent?: string | null;
  activePlan?: AllocationPlan | null;
  onConstraintsChanged?: (updatedProfile: NeedsProfile) => void;
  onChange?: (updatedProfile: NeedsProfile) => void;
}

export function WhatIfControls({
  profile,
  totalCapitalUsdtEquivalent,
  totalPortfolioUsdtEquivalent,
  activePlan,
  onConstraintsChanged,
  onChange,
}: WhatIfControlsProps) {
  const triggerChange = (updated: NeedsProfile) => {
    if (onChange) onChange(updated);
    if (onConstraintsChanged) onConstraintsChanged(updated);
  };

  const valuationAvailable = hasCompleteValuation(profile);
  const totalCapDisplay = valuationAvailable
    ? totalPortfolioUsdtEquivalent || totalCapitalUsdtEquivalent || "UNAVAILABLE"
    : "UNAVAILABLE";
  const currentLiquid = parseInt(profile.minimumLiquidUsdtEquivalent || "300", 10);
  const currentHorizon = profile.horizonDays || 90;
  const currentRisk = profile.riskLevel || "LOW";

  const handleLiquidChange = (newVal: number) => {
    triggerChange({
      ...profile,
      minimumLiquidUsdtEquivalent: newVal.toString(),
    });
  };

  const handleRiskChange = (newRisk: RiskLevel) => {
    let maxVolatile = "0.20";
    if (newRisk === "LOW") maxVolatile = "0.10";
    if (newRisk === "MEDIUM") maxVolatile = "0.20";
    if (newRisk === "HIGH") maxVolatile = "0.40";

    triggerChange({
      ...profile,
      riskLevel: newRisk,
      maxVolatileExposurePct: maxVolatile,
    });
  };

  const handleHorizonChange = (newDays: number) => {
    triggerChange({
      ...profile,
      horizonDays: newDays,
    });
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shadow-2xs">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                What-if · local simulation
              </h3>
              <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                <span>즉시 로컬 재계산</span>
              </span>
              {getValuationStatus(profile) === "SIMULATED" && (
                <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                  SIMULATED inputs
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Change liquidity, horizon or risk and recalculate locally. No Gemini call is made, and confirmed My Rules do not change.
            </p>
          </div>
        </div>

        <div className="text-right text-xs">
          <span className="text-slate-400 block text-[11px]">운용 대상 총 자본</span>
          <span className="font-mono font-bold text-slate-900 text-sm">
            {valuationAvailable ? `${totalCapDisplay} USDT-equivalent` : "UNAVAILABLE · live valuation evidence missing"}
          </span>
        </div>
      </div>

      {/* Control Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Control 1: Minimum Liquid Reserve Slider */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>최소 상시 비상금</span>
            </span>
            <span className="text-sm font-extrabold font-mono text-emerald-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
              {currentLiquid} USDT-eq
            </span>
          </div>

          <input
            type="range"
            min={100}
            max={800}
            step={50}
            value={currentLiquid}
            onChange={(e) => handleLiquidChange(parseInt(e.target.value, 10))}
            className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>100</span>
            <span>300</span>
            <span>500</span>
            <span>800 USDT-eq</span>
          </div>
          <span className="text-[10px] text-slate-400 block">
            비상금을 높이면 안전 자산 비율이 증가하고 가동 자본이 줄어듭니다.
          </span>
        </div>

        {/* Control 2: Risk Tolerance Segmented Control */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-amber-500" />
              <span>위험 선호도</span>
            </span>
            <span className="text-xs font-bold text-slate-900 bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
              {currentRisk === "LOW" ? "안전하게 (10%)" : currentRisk === "MEDIUM" ? "균형 있게 (20%)" : "적극적으로 (40%)"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl">
            <button
              onClick={() => handleRiskChange("LOW")}
              className={`text-xs py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                currentRisk === "LOW"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              안전하게
            </button>
            <button
              onClick={() => handleRiskChange("MEDIUM")}
              className={`text-xs py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                currentRisk === "MEDIUM"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              보통
            </button>
            <button
              onClick={() => handleRiskChange("HIGH")}
              className={`text-xs py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                currentRisk === "HIGH"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              적극적으로
            </button>
          </div>

          <span className="text-[10px] text-slate-400 block">
            변동성 자산(TRX)의 최대 편입 허용 한도를 결정합니다.
          </span>
        </div>

        {/* Control 3: Horizon Segmented Control */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>목표 운용 기간</span>
            </span>
            <span className="text-sm font-extrabold font-mono text-blue-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
              {currentHorizon}일
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl font-mono text-xs">
            {[30, 90, 180, 365].map((days) => (
              <button
                key={days}
                onClick={() => handleHorizonChange(days)}
                className={`py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  currentHorizon === days
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {days}일
              </button>
            ))}
          </div>

          <span className="text-[10px] text-slate-400 block">
            복리 효과 및 약정 기간 동안의 누적 순수익을 시뮬레이션합니다.
          </span>
        </div>
      </div>

      {/* Live Impact Feedback Strip */}
      {activePlan && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between flex-wrap gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-slate-300 block">
                {activePlan.label} · local simulation result
              </span>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-lg font-extrabold font-mono text-emerald-400">
                  {activePlan.valuationStatus === "UNAVAILABLE" ? "UNAVAILABLE" : activePlan.effectiveNetApy ?? "UNAVAILABLE · incentive APY"}
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  {activePlan.valuationStatus === "UNAVAILABLE"
                    ? "Live USDT-equivalent return calculation is unavailable."
                    : activePlan.expectedNetYieldUsdtEquivalent === null
                      ? "Net return unavailable because incentive APY is unknown."
                      : `${activePlan.horizonDays}일 예상 순수익: +${activePlan.expectedNetYieldUsdtEquivalent} USDT-equivalent`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-slate-400 text-[10px] block">상시 비상금</span>
              <span className="text-emerald-400 font-bold">
                {activePlan.valuationStatus === "UNAVAILABLE" ? "UNAVAILABLE" : `${activePlan.liquidReserveUsdtEquivalent} USDT-eq (${activePlan.liquidReservePct})`}
              </span>
            </div>

            <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-slate-400 text-[10px] block">제약 통과율</span>
              <span className="text-blue-300 font-bold">
                {activePlan.constraintChecks.filter((item) => item.passed).length}/{activePlan.constraintChecks.length} PASS
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
