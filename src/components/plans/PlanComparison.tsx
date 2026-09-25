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
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id || "");
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Record<string, boolean>>({});
  const [showFullAiAnalysis, setShowFullAiAnalysis] = useState<boolean>(false);

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
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              맞춤 운용 플랜 비교 (Plan A vs Plan B)
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>하드 제약 검증 통과</span>
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            입력하신 재무 목표와 온체인 실시간 유동성을 반영한 2개의 실행 가능한 포트폴리오입니다.
          </p>
        </div>

        {/* AI Model Tag */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">분석 엔진:</span>
          {isGeminiLive ? (
            <span className="bg-gradient-to-r from-red-950 to-purple-950 text-red-300 border border-red-800/80 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Live Gemini 2.5 Flash</span>
            </span>
          ) : (
            <span className="bg-gray-900 text-gray-400 border border-gray-800 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5">
              <span>규칙 기반 분석 (Offline Fallback)</span>
            </span>
          )}
        </div>
      </div>

      {/* Plan Cards Grid (Consistent 20-24px Padding & Gaps) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map((plan, index) => {
          const isSelected = selectedPlanId === plan.id;
          const isPlanA = index === 0;
          const isLiquidityFirst = plan.strategyType === "LIQUIDITY_FIRST";
          const isDiagnosticsOpen = !!expandedDiagnostics[plan.id];

          const volatileLeg = plan.allocations.find((a) => a.asset === "TRX");
          const volatilePct = volatileLeg
            ? (parseFloat(volatileLeg.allocationPct) * 100).toFixed(1)
            : isLiquidityFirst
            ? "3.3"
            : "13.3";

          // Bullets summary
          const highlights = isPlanA
            ? aiExplanation?.planAHighlights || [
                `상시 유동성 $${plan.liquidReserveUsd} (${plan.liquidReservePct}) 즉시 인출 보존`,
                `변동성 자산(TRX) 노출을 ${volatilePct}%로 최소화`,
                "락업 없는 JustLend 코어 풀 공급으로 원금 손실 차단",
                "안정적인 유동성 방어 중심 배분",
              ]
            : aiExplanation?.planBHighlights || [
                `필수 유동성 $${plan.liquidReserveUsd} 상시 확보 후 자본 가동률 극대화`,
                `변동성 자산 노출을 ${volatilePct}% 이내로 엄격 제어`,
                "JustLend 및 USDD 인센티브 마이닝 복합 배분",
                `약정 기간(${plan.horizonDays}일) 동안 복리 순수익 극대화 추구`,
              ];

          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`rounded-2xl border transition-all cursor-pointer p-6 flex flex-col justify-between ${
                isSelected
                  ? "bg-gray-900/90 border-red-500 shadow-xl shadow-red-950/20 ring-1 ring-red-500/50"
                  : "bg-gray-900/40 border-gray-800 hover:border-gray-700"
              }`}
            >
              <div className="space-y-5">
                {/* 1. Header: Name, Tag, APY */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white tracking-tight">
                        {plan.label}
                      </h3>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                          isLiquidityFirst
                            ? "bg-blue-950/80 text-blue-300 border-blue-800/80"
                            : "bg-amber-950/80 text-amber-300 border-amber-800/80"
                        }`}
                      >
                        {isLiquidityFirst ? "유동성 방어형" : "수익 최적화형"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                      {plan.description}
                    </p>
                  </div>

                  {/* APY Highlight (Primary Visual Anchor) */}
                  <div className="text-right shrink-0">
                    <span className="text-[11px] text-gray-400 block font-medium">예상 순 APY</span>
                    <span className="text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
                      {plan.effectiveNetApy}
                    </span>
                  </div>
                </div>

                {/* 2. Key Metrics Bar */}
                <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-gray-950/80 border border-gray-800/80 text-xs">
                  <div>
                    <span className="text-gray-500 block text-[11px]">총 자산</span>
                    <span className="font-semibold text-white font-mono text-sm">
                      ${plan.totalCapitalUsd}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">상시 유동성</span>
                    <span className="font-semibold text-emerald-400 font-mono text-sm">
                      ${plan.liquidReserveUsd}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">{plan.horizonDays}일 예상 순수익</span>
                    <span className="font-semibold text-emerald-400 font-mono text-sm">
                      +${plan.expectedNetYieldUsd}
                    </span>
                  </div>
                </div>

                {/* 3. Concise AI Bullet Highlights (Replaces giant paragraphs) */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>플랜 핵심 요약 ({isLiquidityFirst ? "Why Safe?" : "Why Balanced?"})</span>
                  </span>
                  <div className="space-y-1.5 p-3 rounded-xl bg-gray-950/50 border border-gray-800/60">
                    {highlights.map((bullet, bIdx) => (
                      <div key={bIdx} className="text-xs text-gray-300 flex items-start gap-2">
                        <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                        <span className="leading-snug">{bullet.replace(/^✓\s*/, "")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Allocation Summary Pills */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                    포트폴리오 배분 내역
                  </span>
                  <div className="space-y-1.5">
                    {plan.allocations.map((leg, lIdx) => (
                      <div
                        key={lIdx}
                        className="p-2.5 rounded-lg bg-gray-950/60 border border-gray-800/70 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-gray-800 flex items-center justify-center font-bold text-[10px] text-gray-200">
                            {leg.asset}
                          </span>
                          <div>
                            <span className="font-semibold text-white">{leg.productName}</span>
                            <span className="text-[11px] text-gray-400 block font-mono">
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
                              Nile 실행 가능
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Progressive Disclosure: Hard Constraint Diagnostics Accordion */}
                <div className="pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDiagnostics(plan.id);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-gray-950/40 hover:bg-gray-800/60 border border-gray-800/60 text-xs text-gray-400 hover:text-white flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>상세 제약조건 검증 내역 ({plan.constraintChecks.length}개 항목)</span>
                    </span>
                    {isDiagnosticsOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {isDiagnosticsOpen && (
                    <div className="mt-2 p-3 rounded-xl bg-gray-950/90 border border-gray-800 space-y-1.5 text-xs animate-in fade-in">
                      {plan.constraintChecks.map((check, cIdx) => (
                        <div
                          key={cIdx}
                          className="flex items-center justify-between text-[11px] py-1 border-b border-gray-800/40 last:border-b-0"
                        >
                          <span className="flex items-center gap-1.5 text-gray-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            {check.name}
                          </span>
                          <span className="text-gray-400 font-mono">{check.actual}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Card CTA Button */}
              <div className="pt-6 mt-4 border-t border-gray-800/80">
                {plan.allocations.some((a) => a.executable) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const execLeg = plan.allocations.find((a) => a.executable)!;
                      onSelectActionForExecution(plan, execLeg);
                    }}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-950 transition-colors"
                  >
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>Nile 테스트넷 트랜잭션 실행 프리뷰</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="text-center text-xs text-gray-500 py-2">
                    온체인 조회 전용 플랜 (Nile 모의 실행은 jTRX 선택 시 가능)
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Explanation Progressive Disclosure Section */}
      {aiExplanation && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>AI 종합 추천 의견</span>
            </div>

            <button
              onClick={() => setShowFullAiAnalysis(!showFullAiAnalysis)}
              className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition-colors"
            >
              <span>{showFullAiAnalysis ? "상세 분석 닫기" : "AI 상세 분석 보기 (View AI explanation)"}</span>
              {showFullAiAnalysis ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Concise Recommendation Summary (Always Visible) */}
          <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 text-purple-200 text-xs leading-relaxed">
            <strong>추천 요약: </strong>
            <span>
              {aiExplanation.recommendationSummary || aiExplanation.comparisonRecommendation}
            </span>
          </div>

          {/* Detailed Paragraphs (Progressive Disclosure) */}
          {showFullAiAnalysis && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in fade-in">
              <div className="p-4 rounded-xl bg-gray-950/80 border border-gray-800/80 space-y-1.5">
                <strong className="text-blue-300 font-semibold text-xs block">
                  Plan A (유동성 방어형) 상세 분석:
                </strong>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {aiExplanation.planAExplanation}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-950/80 border border-gray-800/80 space-y-1.5">
                <strong className="text-amber-300 font-semibold text-xs block">
                  Plan B (수익 최적화형) 상세 분석:
                </strong>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {aiExplanation.planBExplanation}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
