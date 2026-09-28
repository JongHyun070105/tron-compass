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
  ShieldAlert,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  buildDecisionEvidence,
  DecisionAssumption,
  DecisionReceipt,
  evaluateDecisionAssumptions,
} from "@/domain/decision/receipt";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";

interface ReplayMonitorProps {
  originalPlan: AllocationPlan | null;
  profile: NeedsProfile | null;
  liveOpportunities: YieldOpportunity[];
  usddEvidence: UsddProtocolEvidence | null;
  decisionReceipt: DecisionReceipt | null;
  onAssumptionsEvaluated?: (title: string, assumptions: DecisionAssumption[], mode: "LIVE" | "SIMULATED") => void;
  onApplyRebalance?: (newPlan: AllocationPlan, simulatedOpportunities: YieldOpportunity[], assumptions: DecisionAssumption[]) => void;
}

export function ReplayMonitor({
  originalPlan,
  profile,
  liveOpportunities,
  usddEvidence,
  decisionReceipt,
  onAssumptionsEvaluated,
  onApplyRebalance,
}: ReplayMonitorProps) {
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [simulatedOpps, setSimulatedOpps] = useState<YieldOpportunity[]>(liveOpportunities);
  const [simulatedLiquidUsd, setSimulatedLiquidUsd] = useState<string | undefined>(undefined);
  const [reviewedAssumptions, setReviewedAssumptions] = useState<DecisionAssumption[]>(decisionReceipt?.assumptions ?? []);

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
    simulatedOpps,
    simulatedLiquidUsd
  );

  const handleRunScenario = (scenario: ReplayScenario) => {
    setActiveScenarioId(scenario.id);
    const updated = scenario.simulatedMarketDelta(liveOpportunities);
    setSimulatedOpps(updated);
    const liquid = scenario.id === "scenario-liquidity-shortfall"
      ? Math.max(0, Number(profile?.minimumLiquidUsd ?? 0) - 1).toFixed(2)
      : undefined;
    setSimulatedLiquidUsd(liquid);
    const now = new Date().toISOString();
    const currentEvidence = buildDecisionEvidence(updated, usddEvidence, now);
    if (liquid !== undefined) {
      currentEvidence.push({
        id: "simulated-liquid-reserve",
        field: "plan.liquidReserveUsd",
        value: liquid,
        source: "TRON Compass replay input",
        fetchedAt: now,
        terms: "SIMULATED replay input representing a liquid reserve below the confirmed user rule.",
        reality: "SIMULATED",
        observedReality: "SIMULATED",
      });
    }
    const checked = decisionReceipt
      ? evaluateDecisionAssumptions(decisionReceipt.assumptions, currentEvidence, now)
      : [];
    setReviewedAssumptions(checked);
    onAssumptionsEvaluated?.(scenario.title, checked, "SIMULATED");
  };

  const handleResetToLive = () => {
    setActiveScenarioId(null);
    setSimulatedOpps(liveOpportunities);
    setSimulatedLiquidUsd(undefined);
    const now = new Date().toISOString();
    const checked = decisionReceipt
      ? evaluateDecisionAssumptions(decisionReceipt.assumptions, buildDecisionEvidence(liveOpportunities, usddEvidence, now), now)
      : [];
    setReviewedAssumptions(checked);
    onAssumptionsEvaluated?.("Current market evidence", checked, "LIVE");
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
            기록된 결정의 전제가 유지되는지 확인하고, 실패 시 동일 규칙으로 제안을 검사합니다.
          </p>
        </div>

        {activeScenarioId && (
          <button
            onClick={handleResetToLive}
            className="text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Current market evidence</span>
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
            {originalPlan.usdValuationStatus === "UNAVAILABLE"
              ? "UNAVAILABLE"
              : originalPlan.effectiveNetApy === null
                ? "UNAVAILABLE · incentive APY"
                : `${originalPlan.usdValuationStatus === "SIMULATED" ? "SIMULATED · " : ""}${originalPlan.effectiveNetApy}`}
          </div>
          <span className="text-xs text-slate-500 block">
            {originalPlan.usdValuationStatus === "UNAVAILABLE"
              ? "USD valuation evidence is missing; return impact cannot be calculated."
              : originalPlan.expectedNetYieldUsd === null
                ? "Net return is unavailable because source-backed incentive APY is unknown."
                : `${originalPlan.usdValuationStatus === "SIMULATED" ? "SIMULATED · " : ""}순 예상 수익: +$${originalPlan.expectedNetYieldUsd} (${originalPlan.horizonDays}일)`}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
          <span className="text-slate-400 block text-[11px] font-medium">
            {activeScenarioId ? "SIMULATED OUTCOME" : "Current evidence"}
          </span>
            <div className={`text-2xl font-extrabold font-mono ${proposal.triggered ? "text-amber-600" : originalPlan.usdValuationStatus === "UNAVAILABLE" ? "text-slate-600" : "text-emerald-600"}`}>
            {proposal.triggered ? "조건 변화 감지됨" : originalPlan.usdValuationStatus === "UNAVAILABLE" || originalPlan.effectiveNetApy === null ? "평가 불가 · UNKNOWN" : "평가 근거 내 변화 없음"}
          </div>
          <span className="text-xs text-slate-500 block truncate">
            {originalPlan.effectiveNetApy === null && !proposal.triggered
              ? "Incentive APY evidence is unavailable; return assumptions cannot be compared."
              : proposal.marketDeltaSummary}
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
            {proposal.triggered ? "조건 재배분 제안" : originalPlan.usdValuationStatus === "UNAVAILABLE" ? "USD impact and allocation cannot be checked" : originalPlan.effectiveNetApy === null ? "Incentive APY is unknown; no yield comparison is available" : "No trigger found in recorded evidence"}
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
        <div className="p-6 sm:p-7 rounded-3xl bg-amber-50/70 border-2 border-amber-300 space-y-5 animate-in fade-in shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-200/80 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-2xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-amber-950">
                  An assumption behind this decision changed
                </h3>
                <span className="text-xs text-amber-800 font-medium">
                  원인: {proposal.primaryReason}
                </span>
              </div>
            </div>

            <span className="text-[11px] px-3 py-1 rounded-full bg-white text-amber-900 border border-amber-300 font-bold shadow-2xs">
              자동 매매 절대 금지 · 사용자 승인 필수
            </span>
          </div>

          {/* Return Impact Comparison Card: Old Return vs New Return vs Delta */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-amber-200/90 space-y-1">
              <span className="text-slate-400 block text-[11px] font-medium">
                기존 예상 순수익 ({originalPlan.horizonDays}일)
              </span>
              <div className="text-xl font-extrabold font-mono text-slate-800">
                {proposal.originalExpectedReturnUsd === "UNAVAILABLE" ? "UNAVAILABLE" : `$${proposal.originalExpectedReturnUsd}`}
              </div>
              <span className="text-[10px] text-slate-400">초기 시장 조건 기준</span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-amber-200/90 space-y-1">
              <span className="text-slate-400 block text-[11px] font-medium">
                시장 변동 후 예상 수익
              </span>
              <div className="text-xl font-extrabold font-mono text-amber-700">
                {proposal.newExpectedReturnUsd === "UNAVAILABLE" ? "UNAVAILABLE" : `$${proposal.newExpectedReturnUsd}`}
              </div>
              <span className="text-[10px] text-amber-600 font-semibold">SIMULATED OUTCOME · not a forecast</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-100/70 border border-amber-300 space-y-1">
              <span className="text-amber-800 block text-[11px] font-bold">
                예상 수익 변화 (임팩트)
              </span>
              <div className="text-2xl font-black font-mono text-rose-600 flex items-center gap-1">
                <span>{proposal.deltaReturnPct}</span>
                <span className="text-xs font-semibold text-rose-500">
                  {proposal.deltaReturnUsd === "UNAVAILABLE" ? "" : `($${proposal.deltaReturnUsd})`}
                </span>
              </div>
              <span className="text-[10px] text-amber-800 font-medium">리밸런싱 트리거 충족</span>
            </div>
          </div>

          {/* Deterministic explanation grounded in the recorded replay inputs */}
          <div className="p-4 rounded-2xl bg-white border border-amber-200/70 text-xs text-slate-700 leading-relaxed space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-amber-800 font-bold">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Recorded assumption review:</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {reviewedAssumptions.filter((item) => item.status === "FAIL").length
                ? reviewedAssumptions.filter((item) => item.status === "FAIL").map((item) => `${item.id}: ${item.reason ?? item.description}`).join(" · ")
                : "The recorded inputs do not show a failed assumption in this review. Any proposed plan remains subject to My Rules and user approval."}
            </p>
          </div>

          {/* Proposed Plan Comparison & Decisions: [현재 유지] vs [새 플랜 채택] */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between flex-wrap gap-4 text-xs shadow-2xs">
            <div className="space-y-1">
              <span className="text-slate-400 block text-[11px] font-medium">제안된 신규 플랜</span>
              <strong className="text-slate-900 text-sm font-bold block">
                {proposal.proposedPlan.label}
              </strong>
              <span className="text-xs text-emerald-600 font-mono font-bold">
                신규 플랜 복구 APY: {proposal.proposedPlan.effectiveNetApy}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleResetToLive}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                현재 유지 (포지션 불변)
              </button>

              {onApplyRebalance && (
                <button
                  onClick={() => onApplyRebalance(proposal.proposedPlan, simulatedOpps, reviewedAssumptions)}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-2xs transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span>검토 제안을 자식 영수증으로 기록</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
