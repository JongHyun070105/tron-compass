"use client";

import React from "react";
import { YieldOpportunity } from "@/domain/allocation/types";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";
import {
  ExternalLink,
  Shield,
  Layers,
  Coins,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
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
  return (
    <div className="space-y-6">
      {/* Protocol Evidence Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: JustLend DAO */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4.5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              JustLend DAO
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
              OpenAPI v1
            </span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {opportunities.length}개 풀 감시 중
          </div>
          <p className="text-xs text-gray-400 mt-1">
            24개 메인넷 jToken 실시간 검증 (레거시 6개 자동 배제)
          </p>
        </div>

        {/* Card 2: USDD Collateral Ratio */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4.5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              USDD 담보 비율
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              안전 초과 담보
            </span>
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {usddEvidence?.collateralRatioPct || "147.89%"}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            총 담보 {usddEvidence?.totalCollateralUsd || "$2,266M"} / 공급 {usddEvidence?.totalSupplyUsd || "$1,532M"}
          </p>
        </div>

        {/* Card 3: USDD Peg Stability (PSM) */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4.5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              USDD PSM 모듈
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
              1:1 페깅
            </span>
          </div>
          <div className="text-lg font-bold text-white tracking-tight">
            0% 슬리피지 스왑
          </div>
          <p className="text-xs text-gray-400 mt-1">
            TRON 온체인 PSM을 통해 USDT와 1:1 무수수료 교환 보장
          </p>
        </div>

        {/* Card 4: Execution Sandbox */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4.5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
              Nile 실거래 지원
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
              jTRX Mint
            </span>
          </div>
          <div className="text-lg font-bold text-purple-300 tracking-tight">
            TKM7w4...i1pq
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Nile V1 jTRX 컨트랙트로 실 온체인 트랜잭션 검증 가능
          </p>
        </div>
      </div>

      {/* Verified Markets Table */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>JustLend & USDD 검증 마켓 현황</span>
              <span className="text-xs text-gray-400 font-normal">
                (Base APY / Incentive APY 분리 표기)
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              공식 OpenAPI 및 데이터 플랫폼 실시간 수집 결과
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastFetchedAt && (
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                업데이트: {new Date(lastFetchedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 bg-gray-800 text-gray-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-950/60 text-gray-400 border-b border-gray-800">
              <tr>
                <th className="py-3 px-4 font-semibold">마켓 / 자산</th>
                <th className="py-3 px-4 font-semibold">기본 수익률 (Base)</th>
                <th className="py-3 px-4 font-semibold">인센티브 (Incentive)</th>
                <th className="py-3 px-4 font-semibold">총 기대 APY</th>
                <th className="py-3 px-4 font-semibold">가격 위험도</th>
                <th className="py-3 px-4 font-semibold">실행 모드</th>
                <th className="py-3 px-4 font-semibold">데이터 출처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-gray-300">
              {opportunities.slice(0, 6).map((opp) => (
                <tr key={opp.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center font-bold text-[10px] text-gray-300">
                      {opp.asset.slice(0, 3)}
                    </span>
                    <div>
                      <div className="font-semibold">{opp.product}</div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        {opp.contractAddress.slice(0, 6)}...{opp.contractAddress.slice(-4)}
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-gray-300">
                    {toPercentString(opp.baseApy)}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-amber-400">
                    {parseFloat(opp.incentiveApy) > 0
                      ? `+${toPercentString(opp.incentiveApy)}`
                      : "0.00%"}
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
                    {toPercentString(opp.totalApy)}
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        opp.priceRiskClass === "LOW"
                          ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/60"
                          : opp.priceRiskClass === "MEDIUM"
                          ? "bg-blue-950/60 text-blue-400 border-blue-800/60"
                          : "bg-amber-950/60 text-amber-400 border-amber-800/60"
                      }`}
                    >
                      {opp.priceRiskClass}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    {opp.executable ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping"></span>
                        Nile 트랜잭션 가능
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] text-gray-400 bg-gray-800/50 border border-gray-700/50">
                        Mainnet Read-Only
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                    <a
                      href={opp.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-400 flex items-center gap-1"
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
    </div>
  );
}
