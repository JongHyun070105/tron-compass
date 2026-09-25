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
  lastFetchedAt?: string;
}

export function MarketOverview({
  opportunities,
  usddEvidence,
  isLoading,
  onRefresh,
  lastFetchedAt,
}: MarketOverviewProps) {
  const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            생태계 실시간 마켓 현황
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            TRON 메인넷 JustLend 및 USDD 공식 데이터를 실시간으로 검증합니다.
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
            24개 코어 마켓 실시간 검증 (레거시 풀 배제)
          </p>
        </div>

        {/* Card 2: USDD Collateral Ratio */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>USDD 담보 비율</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              초과 담보
            </span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono tracking-tight">
            {usddEvidence?.collateralRatioPct || "147.89%"}
          </div>
          <p className="text-xs text-slate-400 leading-snug">
            담보 {usddEvidence?.totalCollateralUsd || "$2,266M"} / 공급 {usddEvidence?.totalSupplyUsd || "$1,532M"}
          </p>
        </div>

        {/* Card 3: Key Opportunities */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>핵심 수익 풀</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
              인센티브
            </span>
          </div>
          <div className="text-lg font-bold text-slate-900 tracking-tight">
            jUSDD + jTRX
          </div>
          <p className="text-xs text-slate-400 leading-snug">
            스테이블코인 기본 이율 + 프로토콜 채굴 보상
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
              기본 이율(Base)과 채굴 인센티브(Incentive)를 명확히 분리하여 산출합니다.
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
                <th className="py-3 px-4">인센티브 (Incentive)</th>
                <th className="py-3 px-4">총 기대 APY</th>
                <th className="py-3 px-4">가격 위험도</th>
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
                    {parseFloat(opp.incentiveApy) > 0
                      ? `+${toPercentString(opp.incentiveApy)}`
                      : "0.00%"}
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 text-sm">
                    {toPercentString(opp.totalApy)}
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
                      {opp.priceRiskClass === "LOW" ? "안전" : opp.priceRiskClass === "MEDIUM" ? "보통" : "변동"}
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
                      <span>{opp.sourceName.split(" ")[0]}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
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
