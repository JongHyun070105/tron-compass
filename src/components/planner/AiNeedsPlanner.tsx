"use client";

import React, { useState } from "react";
import { NeedsProfile } from "@/domain/allocation/types";
import {
  Sparkles,
  Send,
  HelpCircle,
  SlidersHorizontal,
  CheckCircle,
  Edit3,
  Calendar,
  DollarSign,
  Shield,
  Target,
  ArrowRight,
} from "lucide-react";

interface AiNeedsPlannerProps {
  currentProfile: NeedsProfile | null;
  onProfileConfirmed: (profile: NeedsProfile) => void;
  walletHoldings?: Array<{ asset: string; amount: string }>;
}

const PRESET_PROMPTS = [
  {
    label: "3분 데모 표준 목표 (90일, $300 유동성, 저위험)",
    text: "I have 1,000 USDD and some TRX. I want to invest for about 90 days, but at least $300 must remain liquid. I prefer low risk.",
  },
  {
    label: "단기 유동성 방어 (30일, $500 유동성)",
    text: "I have 1,500 USDD. I need money back in 30 days and at least $500 must stay liquid without lockup.",
  },
  {
    label: "수익 극대화 (180일, 균형 위험)",
    text: "I have 2,000 USDD and 2,500 TRX. I want to maximize yield for 180 days with medium risk tolerance.",
  },
];

export function AiNeedsPlanner({
  currentProfile,
  onProfileConfirmed,
  walletHoldings,
}: AiNeedsPlannerProps) {
  const [inputText, setInputText] = useState(PRESET_PROMPTS[0].text);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);

  // Editable local state for confirmed profile
  const [editableProfile, setEditableProfile] = useState<NeedsProfile>(
    currentProfile || {
      holdings: [
        { asset: "USDD", amount: "1000", estimatedUsd: "1000" },
        { asset: "TRX", amount: "2000", estimatedUsd: "500" },
      ],
      horizonDays: 90,
      minimumLiquidUsd: "300",
      riskLevel: "LOW",
      maxVolatileExposurePct: "0.20",
      goal: "BALANCED",
      missingFields: [],
      assumptions: [],
    }
  );

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setIsAnalyzing(true);
    setFollowUpQuestion(null);

    try {
      const res = await fetch("/api/ai/needs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: inputText,
          walletHoldings,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setEditableProfile(data.data.profile);
        if (data.data.needsClarification && data.data.followUpQuestion) {
          setFollowUpQuestion(data.data.followUpQuestion);
        }
      }
    } catch (err) {
      console.warn("AI analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              AI Needs Analysis & Goal Structuring
            </h2>
            <p className="text-xs text-gray-400">
              자연어 투자 목표를 분석하여 결정론적 제약 조건(Needs Profile)으로 정형화합니다.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsManualMode(!isManualMode)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 text-gray-300 flex items-center gap-1.5 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {isManualMode ? "AI 대화 모드" : "수동 직접 설정"}
        </button>
      </div>

      {/* Preset Quick Chips */}
      {!isManualMode && (
        <div className="mb-4">
          <span className="text-[11px] text-gray-400 font-medium block mb-1.5">
            빠른 데모 시나리오 프리셋:
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESET_PROMPTS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => setInputText(preset.text)}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-800 border border-gray-700/70 text-gray-300 hover:text-white transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Natural Language Input Form */}
      {!isManualMode && (
        <div className="relative mb-6">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={3}
            className="w-full bg-gray-950 border border-gray-700/80 rounded-xl p-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors resize-none"
            placeholder="예: I have 1,000 USDD and some TRX. I want to invest for about 90 days, but at least $300 must remain liquid..."
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="absolute right-3 bottom-3 bg-red-600 hover:bg-red-500 text-white font-medium text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isAnalyzing ? "분석 중..." : "목표 분석"}</span>
          </button>
        </div>
      )}

      {/* Clarification Follow-up Question Banner */}
      {followUpQuestion && (
        <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block text-amber-300 mb-1">
              AI 제약조건 보완 질문:
            </strong>
            <p>{followUpQuestion}</p>
          </div>
        </div>
      )}

      {/* Confirmed Structured Needs Summary Card */}
      <div className="bg-gray-950/80 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 border-b border-gray-800/80 pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              확정된 제약 조건 프로필 (Needs Summary)
            </h3>
          </div>
          <span className="text-xs text-gray-400">
            엔진 배분 시 하드 제약으로 적용됩니다
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* Item 1: Holdings */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-blue-400" />
              보유 자산 (Holdings)
            </span>
            <div className="text-sm font-semibold text-white">
              {editableProfile.holdings.map((h) => `${h.amount} ${h.asset}`).join(" + ")}
            </div>
            <span className="text-[11px] text-gray-500">
              총 추정가치 ~$1,500.00
            </span>
          </div>

          {/* Item 2: Horizon */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              목표 기간 (Horizon)
            </span>
            {isManualMode ? (
              <select
                value={editableProfile.horizonDays}
                onChange={(e) =>
                  setEditableProfile({
                    ...editableProfile,
                    horizonDays: parseInt(e.target.value, 10),
                  })
                }
                className="bg-gray-950 border border-gray-700 text-white text-xs rounded px-2 py-1 mt-0.5 focus:outline-none w-full"
              >
                <option value={30}>30일 (단기)</option>
                <option value={90}>90일 (표준)</option>
                <option value={180}>180일 (중기)</option>
                <option value={365}>365일 (장기)</option>
              </select>
            ) : (
              <div className="text-sm font-semibold text-white">
                {editableProfile.horizonDays}일
              </div>
            )}
            <span className="text-[11px] text-gray-500">복리 수익 추정 기준</span>
          </div>

          {/* Item 3: Minimum Liquid Reserve */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              최소 필요 유동성 (Liquid Reserve)
            </span>
            {isManualMode ? (
              <input
                type="number"
                value={editableProfile.minimumLiquidUsd}
                onChange={(e) =>
                  setEditableProfile({
                    ...editableProfile,
                    minimumLiquidUsd: e.target.value,
                  })
                }
                className="bg-gray-950 border border-gray-700 text-white text-xs rounded px-2 py-1 mt-0.5 focus:outline-none w-full"
              />
            ) : (
              <div className="text-sm font-semibold text-emerald-400">
                ${editableProfile.minimumLiquidUsd}
              </div>
            )}
            <span className="text-[11px] text-gray-500">예치 금지, 상시 보존</span>
          </div>

          {/* Item 4: Risk & Volatility */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              위험 한도 (Risk & Cap)
            </span>
            <div className="text-sm font-semibold text-white">
              {editableProfile.riskLevel} (변동성 max {(parseFloat(editableProfile.maxVolatileExposurePct) * 100).toFixed(0)}%)
            </div>
            <span className="text-[11px] text-gray-500">목표: {editableProfile.goal}</span>
          </div>
        </div>

        {/* Action Button: Confirm and proceed */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={() => onProfileConfirmed(editableProfile)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-md shadow-emerald-950 transition-colors"
          >
            <span>조건 확인 및 2개 최적 플랜 생성</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
