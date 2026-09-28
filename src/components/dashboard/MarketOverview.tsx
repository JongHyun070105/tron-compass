"use client";

import React, { useState } from "react";
import { YieldOpportunity } from "@/domain/allocation/types";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";
import {
  ExternalLink,
  Shield,
  Layers,
  Coins,
  Clock,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { toPercentString } from "@/lib/math/decimal";

interface MarketOverviewProps {
  opportunities: YieldOpportunity[];
  usddEvidence: UsddProtocolEvidence | null;
  isLoading: boolean;
  onRefresh: () => void;
  lastFetchedAt?: string | null;
}

export function MarketOverview({
  opportunities,
  usddEvidence,
  isLoading,
  onRefresh,
  lastFetchedAt,
}: MarketOverviewProps) {
  const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
  const incentiveObservedCount = opportunities.filter((item) => item.incentiveApy !== null).length;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            마켓 근거
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            각 값에는 출처, 조회 시각, 적용 조건, 데이터 현실 라벨이 표시됩니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
              {lastFetchedAt && (
            <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>동기화: {new Date(lastFetchedAt).toLocaleTimeString()}</span>
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-red-500" : ""}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* 4 Clean Fintech Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Monitored Pools */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              <span>JustLend DAO</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
              OpenAPI
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono tracking-tight">
            {opportunities.length}개 풀 감시
          </div>
          <p className="text-xs text-slate-400 leading-snug">
              {opportunities[0]?.reality === "LIVE_MAINNET" ? "LIVE MAINNET" : "SNAPSHOT 또는 조회 제한"} · legacy markets excluded
          </p>
        </div>

        {/* Card 2: USDD Collateral Ratio */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>USDD 담보 비율</span>
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${usddEvidence?.reality === "LIVE_MAINNET" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
              {usddEvidence?.reality ?? "UNAVAILABLE"}
            </span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono tracking-tight">
            {usddEvidence?.collateralRatioPct || "UNKNOWN"}
          </div>
          <p className="text-xs text-slate-400 leading-snug">
            {usddEvidence?.totalCollateralUsd ?? "Unavailable"} collateral / {usddEvidence?.totalSupplyUsd ?? "Unavailable"} supply
          </p>
          <p className="text-[10px] text-slate-400">
            Derived as collateral ÷ supply · fetched {usddEvidence?.fetchedAt ? new Date(usddEvidence.fetchedAt).toLocaleString() : "time unavailable"}
          </p>
          {usddEvidence?.sourceUrl && (
            <a href={usddEvidence.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 hover:underline">
              USDD source <ExternalLink className="inline h-3 w-3" />
            </a>
          )}
        </div>

        {/* Card 3: Key Opportunities */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>핵심 수익 풀</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
              출처 확인
            </span>
          </div>
          <div className="text-lg font-bold text-slate-900 tracking-tight">
            {opportunities.length ? `${incentiveObservedCount}/${opportunities.length} mining rates observed` : "No pool evidence loaded"}
          </div>
          <p className="text-xs text-slate-400 leading-snug">
            {incentiveObservedCount === opportunities.length && opportunities.length > 0
              ? "Base supply rate and USDD mining reward are sourced separately."
              : "Unknown mining rewards remain unavailable and are not included in net returns."}
          </p>
        </div>

        {/* Card 4: Execution Capability */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
              <span>실행 샌드박스</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-200">
              Nile V1
            </span>
          </div>
          <div className="text-lg font-bold text-purple-700 tracking-tight font-mono">
            jTRX 온체인 지원
          </div>
          <p className="text-xs text-slate-400 leading-snug">
            TKM7w4...i1pq 공급 함수 및 영수증 독립 검증
          </p>
        </div>
      </div>

      {/* Expandable Market Data Table Section */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-2xs">
        <div className="p-5 flex items-center justify-between flex-wrap gap-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              세부 마켓 유동성 & 수익률 목록
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Base APY와 USDD mining incentive를 분리해 보여줍니다. Total = Base + Incentive.
            </p>
          </div>

          <button
            onClick={() => setIsTableExpanded(!isTableExpanded)}
            className="text-xs px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{isTableExpanded ? "테이블 접기" : "전체 마켓 테이블 펼치기"}</span>
            {isTableExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Default shows top 4 pools; expanded shows all pools */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-3 px-5">마켓 / 자산</th>
                <th className="py-3 px-4">기본 수익률 (Base)</th>
                <th className="py-3 px-4">USDD mining incentive</th>
                <th className="py-3 px-4">Total (Base + Incentive)</th>
                <th className="py-3 px-4">Compass price-risk classification</th>
                <th className="py-3 px-4">실행 가능성</th>
                <th className="py-3 px-5">데이터 출처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {(isTableExpanded ? opportunities : opportunities.slice(0, 4)).map((opp) => (
                <tr key={opp.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-5 font-medium text-slate-900 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-700">
                      {opp.asset.slice(0, 3)}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{opp.product}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {opp.contractAddress.slice(0, 6)}...{opp.contractAddress.slice(-4)}
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-slate-600 font-medium">
                    {toPercentString(opp.baseApy)}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-amber-600 font-semibold">
                    {opp.incentiveApy === null
                      ? "Unavailable"
                      : `+${toPercentString(opp.incentiveApy)}`}
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 text-sm">
                    {opp.totalApy === null ? "Unavailable" : toPercentString(opp.totalApy)}
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        opp.priceRiskClass === "LOW"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : opp.priceRiskClass === "MEDIUM"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {opp.priceRiskClass}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    {opp.executable ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                        Nile 트랜잭션 지원
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] text-slate-400 bg-slate-100 border border-slate-200">
                        Mainnet 실시간 조회
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-5 text-slate-400 text-[11px]">
                    <a
                      href={opp.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 flex items-center gap-1 font-medium transition-colors"
                    >
                      <span>Base source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="mt-1 block">
                      Base · {opp.reality || "UNKNOWN"} · {opp.fetchedAt ? new Date(opp.fetchedAt).toLocaleString() : "fetch time unavailable"}
                    </span>
                    <span className="block max-w-[220px] truncate" title={opp.evidenceTerms}>
                      {opp.evidenceTerms}
                    </span>
                    <a
                      href={opp.incentiveSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 hover:text-blue-600 flex items-center gap-1 font-medium transition-colors"
                    >
                      <span>USDD incentive source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="block">
                      Incentive · {opp.incentiveReality || "UNAVAILABLE"} · {opp.incentiveFetchedAt ? new Date(opp.incentiveFetchedAt).toLocaleString() : "fetch time unavailable"}
                    </span>
                    <span className="block max-w-[220px] truncate" title={opp.incentiveEvidenceTerms}>
                      {opp.incentiveEvidenceTerms}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
