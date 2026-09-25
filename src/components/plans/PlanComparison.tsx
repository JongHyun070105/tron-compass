"use client";

import React, { useState } from "react";
import { AllocationPlan, AllocationLeg } from "@/domain/allocation/types";
import { PlanExplanation } from "@/lib/ai/schemas";
import {
  ShieldCheck,
  TrendingUp,
  Percent,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Radio,
  ChevronDown,
  ChevronUp,
  Shield,
  Layers,
  Info,
  Check,
  Zap,
} from "lucide-react";
import { toPercentString } from "@/lib/math/decimal";

interface PlanComparisonProps {
  plans: AllocationPlan[];
  onSelectActionForExecution: (plan: AllocationPlan, leg: AllocationLeg) => void;
  aiExplanation?: (PlanExplanation & { provider?: "gemini" | "mock_fallback" }) | null;
  aiProvider?: "gemini" | "mock_fallback";
  aiModel?: string;
  isAiExplaining?: boolean;
}

export function PlanComparison({
  plans,
  onSelectActionForExecution,
  aiExplanation,
  aiProvider,
  aiModel,
  isAiExplaining = false,
}: PlanComparisonProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[1]?.id || plans[0]?.id || "");
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Record<string, boolean>>({});
  const [showFullAiDrawer, setShowFullAiDrawer] = useState<boolean>(false);

  if (!plans || plans.length === 0) {
    return null;
  }

  const toggleDiagnostics = (planId: string) => {
    setExpandedDiagnostics((prev) => ({
      ...prev,
      [planId]: !prev[planId],
    }));
  };

  const isGeminiLive =
    aiProvider === "gemini" || aiExplanation?.provider === "gemini";

  return (
    <section className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              맞춤 운용 플랜 비교
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>하드 제약 100% 통과</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            원금 안전과 목표 유동성을 보장하는 2가지 최적화 플랜을 비교해보세요.
          </p>
        </div>

        {/* AI Provider Badge */}
        <div className="flex items-center gap-2">
          {isGeminiLive ? (
            <span className="bg-red-50 text-red-700 border border-red-200/80 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Gemini 2.5 Flash 분석</span>
            </span>
          ) : (
            <span className="bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5">
              <span>규칙 기반 분석 (Fallback)</span>
            </span>
          )}
        </div>
      </div>

      {/* Plan Cards Grid: 2 Premium Cards (Clean, Spacious, Large Numbers) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map((plan, index) => {
          const isSelected = selectedPlanId === plan.id;
          const isPlanA = index === 0;
          const isLiquidityFirst = plan.strategyType === "LIQUIDITY_FIRST";
          const isDiagnosticsOpen = !!expandedDiagnostics[plan.id];

          // Simplified copy
          const planFriendlyName = isLiquidityFirst ? "안정형 (Safe)" : "수익형 (Balanced)";
          const planOneLineSummary = isLiquidityFirst
            ? "원금 보존과 즉시 출금 가능한 유동성을 최우선으로 확보합니다."
            : "최소 비상금을 유지하면서 JustLend 인센티브로 수익을 극대화합니다.";

          // Short 4-bullet highlights as requested by design principle
          const bulletHighlights = isLiquidityFirst
            ? [
                "언제든 출금할 수 있는 상시 비상금을 넉넉히 확보합니다",
                "가격 변동이 있는 자산(TRX) 노출을 최소화합니다",
                "락업 없는 코어 풀을 활용해 원금 손실을 철저히 방어합니다",
                "예상 수익은 다소 낮지만 변동장에서도 가장 안전합니다",
              ]
            : [
                "최소 비상금 조건을 충실히 지키며 자본 가동률을 극대화합니다",
                "JustLend 및 USDD 인센티브 마이닝 복합 배분으로 높은 수익 추구",
                "변동성 자산(TRX) 노출을 한도 내에서 철저히 통제합니다",
                "약정 운용 기간 동안 복리 순수익을 최대로 높입니다",
              ];

          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`rounded-3xl border transition-all cursor-pointer p-6 sm:p-7 flex flex-col justify-between relative ${
                isSelected
                  ? "bg-white border-red-500 shadow-md ring-2 ring-red-500/20"
                  : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs"
              }`}
            >
              {/* Highlight ribbon for Plan B (Best Yield) */}
              {!isLiquidityFirst && (
                <div className="absolute top-4 right-4 bg-red-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-2xs flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>추천 플랜</span>
                </div>
              )}

              <div className="space-y-6">
                {/* 1. Header: Name, Tag, Description */}
                <div className="space-y-2 pr-16">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        isLiquidityFirst ? "bg-blue-500" : "bg-red-500"
                      }`}
                    ></span>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                      {planFriendlyName}
                    </h3>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        isLiquidityFirst
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {isLiquidityFirst ? "유동성 방어" : "수익 최적화"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {planOneLineSummary}
                  </p>
                </div>

                {/* 2. Primary Number: Expected APY (Visual Anchor) */}
                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 sm:p-5 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">
                      예상 연 수익률 (순 APY)
                    </span>
                    <div className="text-3xl sm:text-4xl font-extrabold text-emerald-600 font-mono tracking-tight">
                      {plan.effectiveNetApy}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-medium text-slate-400 block mb-0.5">
                      {plan.horizonDays}일 예상 순수익
                    </span>
                    <span className="text-lg sm:text-xl font-bold text-slate-800 font-mono">
                      +${plan.expectedNetYieldUsd}
                    </span>
                  </div>
                </div>

                {/* 3. Core Financial Stats Grid */}
                <div className="grid grid-cols-3 gap-2.5 text-xs text-center">
                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5">
                    <span className="text-slate-400 block text-[11px]">상시 비상금</span>
                    <strong className="text-emerald-700 font-mono text-sm block mt-0.5">
                      ${plan.liquidReserveUsd}
                    </strong>
                    <span className="text-[10px] text-slate-400">즉시 인출</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5">
                    <span className="text-slate-400 block text-[11px]">위험도</span>
                    <strong className="text-slate-800 text-sm block mt-0.5">
                      {isLiquidityFirst ? "낮음" : "보통"}
                    </strong>
                    <span className="text-[10px] text-slate-400">
                      {isLiquidityFirst ? "원금 보호" : "균형 수익"}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5">
                    <span className="text-slate-400 block text-[11px]">운용 기간</span>
                    <strong className="text-slate-800 font-mono text-sm block mt-0.5">
                      {plan.horizonDays}일
                    </strong>
                    <span className="text-[10px] text-slate-400">복리 기준</span>
                  </div>
                </div>

                {/* 4. Why this plan? (Short Bullet Summary) */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>왜 {isLiquidityFirst ? "안정형" : "수익형"} 플랜인가요?</span>
                  </span>

                  <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-3.5 space-y-2">
                    {bulletHighlights.map((bullet, bIdx) => (
                      <div key={bIdx} className="text-xs text-slate-600 flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                          ✓
                        </span>
                        <span className="leading-snug">{bullet}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Main Allocation Summary (Clean List) */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">
                    포트폴리오 배분 내역
                  </span>
                  <div className="space-y-2">
                    {plan.allocations.map((leg, lIdx) => (
                      <div
                        key={lIdx}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-[11px] text-slate-700 shadow-2xs">
                            {leg.asset}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block">
                              {leg.productName}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {leg.amount} {leg.asset} (${leg.usdValue})
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-emerald-600 font-mono font-bold block text-sm">
                            {toPercentString(leg.totalApy)}
                          </span>
                          {leg.executable && (
                            <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                              Nile 실행 지원
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 6. Progressive Disclosure: Hard Constraints Accordion */}
                <div className="pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDiagnostics(plan.id);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:text-slate-900 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>세부 제약조건 검증 ({plan.constraintChecks.length}개 항목 확인)</span>
                    </span>
                    {isDiagnosticsOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {isDiagnosticsOpen && (
                    <div className="mt-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs animate-in fade-in">
                      {plan.constraintChecks.map((check, cIdx) => (
                        <div
                          key={cIdx}
                          className="flex items-center justify-between text-[11px] py-1 border-b border-slate-200/60 last:border-b-0"
                        >
                          <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {check.name}
                          </span>
                          <span className="text-slate-500 font-mono">{check.actual}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 7. Action Button: Select CTA */}
              <div className="pt-6 mt-6 border-t border-slate-100">
                {plan.allocations.some((a) => a.executable) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const execLeg = plan.allocations.find((a) => a.executable)!;
                      onSelectActionForExecution(plan, execLeg);
                    }}
                    className={`w-full font-bold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98] cursor-pointer ${
                      isSelected
                        ? "bg-slate-900 hover:bg-slate-800 text-white"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span>이 플랜으로 실행 검토하기</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="text-center text-xs text-slate-400 py-2">
                    조회 전용 플랜 (Nile 모의 실행은 jTRX 선택 시 가능)
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Deep Analysis Drawer / Expandable Panel */}
      {aiExplanation && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>AI 종합 추천 의견</span>
            </div>

            <button
              onClick={() => setShowFullAiDrawer(!showFullAiDrawer)}
              className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{showFullAiDrawer ? "접기" : "AI 상세 분석 보기"}</span>
              {showFullAiDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Concise Recommendation Summary (Always Visible) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-700 text-xs sm:text-sm leading-relaxed">
            <strong className="text-slate-900">추천 요약: </strong>
            <span>
              {aiExplanation.recommendationSummary || aiExplanation.comparisonRecommendation}
            </span>
          </div>

          {/* Detailed Paragraphs (Progressive Disclosure) */}
          {showFullAiDrawer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in fade-in">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <strong className="text-blue-900 font-bold text-xs block">
                  Plan A (안정형) 심층 분석:
                </strong>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {aiExplanation.planAExplanation}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <strong className="text-amber-900 font-bold text-xs block">
                  Plan B (수익형) 심층 분석:
                </strong>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {aiExplanation.planBExplanation}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
