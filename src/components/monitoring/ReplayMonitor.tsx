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
      <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 text-center text-xs text-gray-500">
        배분 계획이 수립되면 시점 스냅샷 추적 및 히스토리컬 리플레이 모드가 활성화됩니다.
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

    // If cached in ref, reuse without network call
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
    <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-amber-400" />
              <span>Historical Replay & Rebalance Monitor</span>
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
              SIMULATED REPLAY
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            기존 계획의 가정을 저장하고, 30일 경과 또는 시장 변화 발생 시 리밸런싱 제안을 검증합니다.
          </p>
        </div>

        {activeScenarioId && (
          <button
            onClick={handleResetToLive}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>실시간 메인넷 데이터로 복귀</span>
          </button>
        )}
      </div>

      {/* Scenario Controls Bar */}
      <div className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 space-y-3">
        <span className="text-xs font-semibold text-gray-300 block">
          테스트용 시뮬레이션 시나리오 선택 (Replay Controls):
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {REPLAY_SCENARIOS.map((sc) => {
            const isActive = activeScenarioId === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => handleRunScenario(sc)}
                className={`p-3 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                  isActive
                    ? "bg-amber-950/40 border-amber-500 ring-1 ring-amber-500/50"
                    : "bg-gray-900/60 border-gray-800 hover:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Play className="w-3 h-3 text-amber-400 fill-amber-400" />
                    {sc.title}
                  </span>
                  <span className="text-[10px] bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                    +{sc.timePassedDays}일 후
                  </span>
                </div>
                <p className="text-gray-400 text-[11px] line-clamp-2">
                  {sc.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparison: Original vs Current */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-gray-950/70 border border-gray-800">
          <span className="text-gray-500 block mb-1">최초 수립 시점 기대 APY</span>
          <span className="text-xl font-bold font-mono text-white">
            {originalPlan.effectiveNetApy}
          </span>
          <span className="text-[11px] text-gray-400 block mt-1">
            순 예상 수익: +${originalPlan.expectedNetYieldUsd}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-gray-950/70 border border-gray-800">
          <span className="text-gray-500 block mb-1">
            {activeScenarioId ? "시뮬레이션 환경 현재 상태" : "실시간 환경 현재 상태"}
          </span>
          <span className={`text-xl font-bold font-mono ${proposal.triggered ? "text-amber-400" : "text-emerald-400"}`}>
            {proposal.triggered ? "조건 변화 감지됨" : "목표 충족 중 (정상)"}
          </span>
          <span className="text-[11px] text-gray-400 block mt-1">
            {proposal.marketDeltaSummary}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-gray-950/70 border border-gray-800">
          <span className="text-gray-500 block mb-1">리밸런싱 트리거 여부</span>
          <div className="flex items-center gap-2 mt-1">
            {proposal.triggered ? (
              <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                리밸런싱 제안 생성됨
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                현 포지션 유지 (HOLD)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rebalance Proposal Card (if triggered) */}
      {proposal.triggered && (
        <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-800/60 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-amber-800/40 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  제안된 리밸런싱 플랜 (Rebalance Proposal)
                </h3>
                <span className="text-xs text-amber-300">
                  사유: {proposal.primaryReason}
                </span>
              </div>
            </div>

            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700 font-semibold">
              사용자 명시적 승인 필요 (자동 매매 금지)
            </span>
          </div>

          {/* AI Explanation of Rebalance */}
          <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 text-xs text-gray-300">
            <div className="flex items-center gap-1.5 text-amber-300 font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 리밸런싱 사유 및 조언:</span>
            </div>
            <p>
              {isExplaining
                ? "AI 조언 생성 중..."
                : aiRebalanceAdvice ||
                  "기존 포지션의 인센티브 보상 소멸로 인해 기대 수익률이 급감했습니다. 수익률이 저하된 USDD 비중을 회수하고, 현재 안정적 수익을 제공하는 대체 마켓으로 재배분하는 것이 유리합니다."}
            </p>
          </div>

          {/* Proposed Plan Metrics */}
          <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 flex items-center justify-between flex-wrap gap-3 text-xs">
            <div>
              <span className="text-gray-500 block text-[11px]">제안 플랜</span>
              <strong className="text-white text-sm">
                {proposal.proposedPlan.label}
              </strong>
            </div>

            <div>
              <span className="text-gray-500 block text-[11px]">개선된 순 APY</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">
                {proposal.proposedPlan.effectiveNetApy}
              </span>
            </div>

            <div>
              <span className="text-gray-500 block text-[11px]">보존 상시 유동성</span>
              <span className="text-white font-mono font-semibold">
                ${proposal.proposedPlan.liquidReserveUsd} ({proposal.proposedPlan.liquidReservePct})
              </span>
            </div>

            {onApplyRebalance && (
              <button
                onClick={() => onApplyRebalance(proposal.proposedPlan)}
                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-md shadow-amber-950 transition-colors"
              >
                <span>제안 플랜 채택하기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
