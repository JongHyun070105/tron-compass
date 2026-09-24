"use client";

import React, { useState } from "react";
import { AllocationPlan, AllocationLeg } from "@/domain/allocation/types";
import {
  ShieldCheck,
  TrendingUp,
  Percent,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Radio,
  Clock,
  Layers,
} from "lucide-react";
import { toPercentString } from "@/lib/math/decimal";

interface PlanComparisonProps {
  plans: AllocationPlan[];
  onSelectActionForExecution: (plan: AllocationPlan, leg: AllocationLeg) => void;
  aiExplanation?: {
    planAExplanation: string;
    planBExplanation: string;
    comparisonRecommendation: string;
  } | null;
}

export function PlanComparison({
  plans,
  onSelectActionForExecution,
  aiExplanation,
}: PlanComparisonProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id || "");

  if (!plans || plans.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span>Deterministic Plan Comparison (Plan A vs Plan B)</span>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium">
              하드 제약 검증 완료
            </span>
          </h2>
          <p className="text-xs text-gray-400">
            사용자 제약 조건과 실시간 마켓 데이터를 바탕으로 2개의 실행 가능한 운용안을 계산했습니다.
          </p>
        </div>
      </div>

      {/* Side-by-Side Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map((plan) => {
          const isSelected = selectedPlanId === plan.id;
          const isLiquidityFirst = plan.strategyType === "LIQUIDITY_FIRST";

          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`rounded-2xl border transition-all cursor-pointer p-6 relative flex flex-col justify-between ${
                isSelected
                  ? "bg-gray-900/90 border-red-500 shadow-xl shadow-red-950/20 ring-1 ring-red-500/50"
                  : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
              }`}
            >
              <div>
                {/* Plan Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">
                        {plan.label}
                      </h3>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          isLiquidityFirst
                            ? "bg-blue-950 text-blue-300 border-blue-800"
                            : "bg-amber-950 text-amber-300 border-amber-800"
                        }`}
                      >
                        {isLiquidityFirst ? "유동성 방어 우선" : "수익률 최적화"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {plan.description}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-400 block">순 기대 APY</span>
                    <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                      {plan.effectiveNetApy}
                    </span>
                  </div>
                </div>

                {/* Capital & Reserve Breakdown */}
                <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-gray-950/70 border border-gray-800/80 mb-5 text-xs">
                  <div>
                    <span className="text-gray-500 block text-[11px]">총 자본</span>
                    <span className="font-semibold text-white font-mono">
                      ${plan.totalCapitalUsd}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">상시 유동성</span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      ${plan.liquidReserveUsd} ({plan.liquidReservePct})
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">예치 운용액</span>
                    <span className="font-semibold text-blue-400 font-mono">
                      $
                      {(
                        parseFloat(plan.totalCapitalUsd) -
                        parseFloat(plan.liquidReserveUsd)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Yield Composition (Base / Incentive / Cost) */}
                <div className="mb-5 space-y-2">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                    {plan.horizonDays}일 운용 수익 구성 (Yield Decomposition)
                  </span>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-gray-950/50 border border-gray-800">
                      <span className="text-gray-400 block text-[11px]">기본 이자 (Base)</span>
                      <span className="font-semibold text-gray-200 font-mono">
                        +${plan.expectedBaseYieldUsd}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-gray-950/50 border border-gray-800">
                      <span className="text-amber-400/90 block text-[11px]">채굴 보상 (Incentive)</span>
                      <span className="font-semibold text-amber-300 font-mono">
                        +${plan.expectedIncentiveYieldUsd}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-gray-950/50 border border-gray-800">
                      <span className="text-red-400/90 block text-[11px]">예상 수수료 (Fee)</span>
                      <span className="font-semibold text-red-300 font-mono">
                        -${plan.estimatedTotalCostUsd}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-center justify-between text-xs">
                    <span className="text-emerald-300 font-medium">
                      기간 내 순 예상 수익 (Net Return):
                    </span>
                    <span className="text-emerald-400 font-bold font-mono text-sm">
                      +${plan.expectedNetYieldUsd} USD
                    </span>
                  </div>
                </div>

                {/* Allocation Legs */}
                <div className="mb-5">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                    포트폴리오 배분 내역
                  </span>
                  <div className="space-y-1.5">
                    {plan.allocations.map((leg, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-gray-950/40 border border-gray-800/60 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-gray-800 flex items-center justify-center font-bold text-[10px] text-gray-300">
                            {leg.asset}
                          </span>
                          <div>
                            <span className="font-medium text-white">{leg.productName}</span>
                            <span className="text-[11px] text-gray-500 block font-mono">
                              {leg.amount} {leg.asset} (${leg.usdValue})
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-emerald-400 font-mono font-semibold block">
                            {toPercentString(leg.totalApy)}
                          </span>
                          {leg.executable && (
                            <span className="text-[10px] text-purple-300 bg-purple-950 px-1.5 py-0.5 rounded border border-purple-800">
                              Nile 실행 대상
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Constraint Checks Pill List */}
                <div className="mb-5">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                    하드 제약 조건 만족 여부
                  </span>
                  <div className="space-y-1 text-xs">
                    {plan.constraintChecks.map((check, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-gray-300 text-[11px] py-1 border-b border-gray-800/40"
                      >
                        <span className="flex items-center gap-1.5 text-gray-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          {check.name}
                        </span>
                        <span className="text-gray-400 font-mono">{check.actual}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-3 border-t border-gray-800/80">
                {plan.allocations.some((a) => a.executable) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const execLeg = plan.allocations.find((a) => a.executable)!;
                      onSelectActionForExecution(plan, execLeg);
                    }}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-md shadow-purple-950 transition-colors"
                  >
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>Nile 테스트넷 트랜잭션 실행 프리뷰</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="text-center text-xs text-gray-500 py-1">
                    Mainnet Insight 전용 플랜 (Nile 모의 실행은 jTRX 선택 시 가능)
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Explanation & Comparison Banner */}
      {aiExplanation && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 text-xs text-gray-300 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>AI 플랜 분석 및 추천 의견</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-gray-950/70 border border-gray-800/80">
              <strong className="text-blue-300 font-semibold block mb-1">
                Plan A (유동성 방어) 분석:
              </strong>
              <p>{aiExplanation.planAExplanation}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-950/70 border border-gray-800/80">
              <strong className="text-amber-300 font-semibold block mb-1">
                Plan B (수익 최적화) 분석:
              </strong>
              <p>{aiExplanation.planBExplanation}</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-emerald-200">
            <strong>최종 비교 추천: </strong>
            <span>{aiExplanation.comparisonRecommendation}</span>
          </div>
        </div>
      )}
    </div>
  );
}
