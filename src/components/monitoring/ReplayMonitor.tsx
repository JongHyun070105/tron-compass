"use client";

import React, { useState } from "react";
import { AllocationPlan, YieldOpportunity, NeedsProfile } from "@/domain/allocation/types";
import { REPLAY_SCENARIOS, ReplayScenario } from "@/domain/monitoring/replay-scenarios";
import { detectRebalanceOpportunity, RebalanceProposal } from "@/domain/monitoring/rebalance-engine";
import {
  History,
  Play,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  TrendingDown,
  Info,
} from "lucide-react";
import { toPercentString } from "@/lib/math/decimal";

interface ReplayMonitorProps {
  originalPlan: AllocationPlan | null;
  profile: NeedsProfile | null;
  liveOpportunities: YieldOpportunity[];
  onApplyRebalance?: (newPlan: AllocationPlan) => void;
}

export function ReplayMonitor({
  originalPlan,
  profile,
  liveOpportunities,
  onApplyRebalance,
}: ReplayMonitorProps) {
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [simulatedOpps, setSimulatedOpps] = useState<YieldOpportunity[]>(liveOpportunities);
  const [aiRebalanceAdvice, setAiRebalanceAdvice] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const scenarioCacheRef = React.useRef<Record<string, string>>({});

  if (!originalPlan || !profile) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 text-center text-xs text-slate-400 shadow-2xs">
        배분 플랜이 수립되면 시점 스냅샷 추적 및 모의 리밸런싱 기능이 활성화됩니다.
      </div>
    );
  }

  // Detect rebalance proposal against current (or simulated) opportunities
  const proposal: RebalanceProposal = detectRebalanceOpportunity(
    originalPlan,
    profile,
    simulatedOpps
  );

  const handleRunScenario = async (scenario: ReplayScenario) => {
    setActiveScenarioId(scenario.id);
    const updated = scenario.simulatedMarketDelta(liveOpportunities);
    setSimulatedOpps(updated);

    if (scenarioCacheRef.current[scenario.id]) {
      setAiRebalanceAdvice(scenarioCacheRef.current[scenario.id]);
      return;
    }

    setAiRebalanceAdvice(null);
    setIsExplaining(true);

    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "REBALANCE",
          originalPlan,
          triggerReason: scenario.expectedTriggerReason,
          currentMarketChange: scenario.description,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const advice = data.data.explanation + " " + data.data.actionAdvice;
        scenarioCacheRef.current[scenario.id] = advice;
        setAiRebalanceAdvice(advice);
      }
    } catch {
      const fallback =
        "시장 조건 변화에 따른 예상 APY 하락이 감지되었습니다. 원금 안전과 목표 유동성 유지를 위해 신규 조건 플랜으로 리밸런싱을 권고합니다.";
      scenarioCacheRef.current[scenario.id] = fallback;
      setAiRebalanceAdvice(fallback);
    } finally {
      setIsExplaining(false);
    }
  };

  const handleResetToLive = () => {
    setActiveScenarioId(null);
    setSimulatedOpps(liveOpportunities);
    setAiRebalanceAdvice(null);
  };

  return (
    <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
      {/* Header with Visual Simulation Disclaimer Banner */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <History className="w-6 h-6 text-amber-500" />
              <span>사후 관리 & 시뮬레이션 리플레이</span>
            </h2>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold">
              SIMULATED REPLAY
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            시간 경과나 급격한 시장 변동 시 포트폴리오를 재조정(리밸런싱)하는 모의 시뮬레이터입니다.
          </p>
        </div>

        {activeScenarioId && (
          <button
            onClick={handleResetToLive}
            className="text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>실시간 메인넷 데이터로 복귀</span>
          </button>
        )}
      </div>

      {/* Trust Notice Box: Visually Obvious Simulation Label */}
      <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2.5">
        <Info className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          <strong>안내: </strong>본 섹션의 모든 동작은 실제 지갑 자산에 영향을 주지 않는 <strong>가상 시뮬레이션(Simulated Replay)</strong>입니다.
        </span>
      </div>

      {/* 3 Core Summary Cards (Default Summary) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
          <span className="text-slate-400 block text-[11px] font-medium">최초 수립 시점 기대 APY</span>
          <div className="text-2xl font-extrabold font-mono text-slate-900">
            {originalPlan.effectiveNetApy}
          </div>
          <span className="text-xs text-slate-500 block">
            순 예상 수익: +${originalPlan.expectedNetYieldUsd} ({originalPlan.horizonDays}일)
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
          <span className="text-slate-400 block text-[11px] font-medium">
            {activeScenarioId ? "시뮬레이션 환경 상태" : "실시간 환경 상태"}
          </span>
          <div className={`text-2xl font-extrabold font-mono ${proposal.triggered ? "text-amber-600" : "text-emerald-600"}`}>
            {proposal.triggered ? "조건 변화 감지됨" : "목표 충족 중 (정상)"}
          </div>
          <span className="text-xs text-slate-500 block truncate">
            {proposal.marketDeltaSummary}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
          <span className="text-slate-400 block text-[11px] font-medium">리밸런싱 제안 여부</span>
          <div className="pt-0.5">
            {proposal.triggered ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>리밸런싱 제안 발생</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>현 포지션 유지 (HOLD)</span>
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 block">
            {proposal.triggered ? "조건 재배분 권고" : "목표 범위 내 안정 운용"}
          </span>
        </div>
      </div>

      {/* Replay Scenario Triggers (Clean Action Cards) */}
      <div className="space-y-3">
        <span className="text-xs font-bold text-slate-700 block">
          가상 시장 변화 시나리오 테스트:
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REPLAY_SCENARIOS.map((sc) => {
            const isActive = activeScenarioId === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => handleRunScenario(sc)}
                className={`p-4 rounded-2xl border text-left text-xs transition-all flex flex-col justify-between cursor-pointer ${
                  isActive
                    ? "bg-amber-50/50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                    <Play className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    {sc.title}
                  </span>
                  <span className="text-[11px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-mono font-medium">
                    +{sc.timePassedDays}일 후 시뮬레이션
                  </span>
                </div>
                <p className="text-slate-500 text-xs leading-relaxed">
                  {sc.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rebalance Proposal Card (Triggered by scenario) */}
      {proposal.triggered && (
        <div className="p-6 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-amber-200/80 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  신규 리밸런싱 최적화 제안
                </h3>
                <span className="text-xs text-amber-800">
                  사유: {proposal.primaryReason}
                </span>
              </div>
            </div>

            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white text-amber-800 border border-amber-200 font-semibold shadow-2xs">
              자동 매매 금지 · 사용자 승인 필수
            </span>
          </div>

          {/* AI Explanation of Rebalance */}
          <div className="p-4 rounded-xl bg-white border border-amber-200/70 text-xs text-slate-700 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 text-amber-700 font-bold mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>AI 리밸런싱 분석 및 권고사항:</span>
            </div>
            <p>
              {isExplaining
                ? "AI 권고사항 생성 중..."
                : aiRebalanceAdvice ||
                  "기존 포지션의 인센티브 보상 소멸로 인해 기대 수익률이 급감했습니다. 수익률이 저하된 자산을 회수하고, 현재 안정적 수익을 제공하는 대체 마켓으로 재배분하는 것이 유리합니다."}
            </p>
          </div>

          {/* Proposed Plan Comparison & CTA */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between flex-wrap gap-4 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">제안된 신규 플랜</span>
              <strong className="text-slate-900 text-sm font-bold">
                {proposal.proposedPlan.label}
              </strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">개선된 예상 APY</span>
              <span className="text-emerald-600 font-mono font-extrabold text-base">
                {proposal.proposedPlan.effectiveNetApy}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">유지 비상금</span>
              <span className="text-slate-800 font-mono font-semibold">
                ${proposal.proposedPlan.liquidReserveUsd} ({proposal.proposedPlan.liquidReservePct})
              </span>
            </div>

            {onApplyRebalance && (
              <button
                onClick={() => onApplyRebalance(proposal.proposedPlan)}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
              >
                <span>제안 플랜 채택하기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
