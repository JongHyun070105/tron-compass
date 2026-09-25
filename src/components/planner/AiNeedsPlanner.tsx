"use client";

import React, { useState } from "react";
import { NeedsProfile } from "@/domain/allocation/types";
import {
  Sparkles,
  Send,
  HelpCircle,
  SlidersHorizontal,
  CheckCircle,
  Calendar,
  DollarSign,
  Shield,
  Target,
  ArrowRight,
  Loader2,
  Check,
} from "lucide-react";

interface AiNeedsPlannerProps {
  currentProfile: NeedsProfile | null;
  onProfileConfirmed: (profile: NeedsProfile) => void;
  walletHoldings?: Array<{ asset: string; amount: string }>;
}

const PRESET_PROMPTS = [
  {
    label: "기본 추천 (90일 · $300 비상금 · 저위험)",
    text: "1,000 USDD와 보유 중인 TRX를 90일 동안 운용하고 싶어요. 최소 $300는 언제든 출금할 수 있도록 남겨두고 저위험으로 안전하게 굴리고 싶습니다.",
  },
  {
    label: "단기 비상금 보호 (30일 · $500 비상금)",
    text: "1,500 USDD가 있습니다. 30일 이내에 단기로 운용하되, 최소 $500는 락업 없이 즉시 쓸 수 있어야 합니다.",
  },
  {
    label: "중기 수익 극대화 (180일 · 균형 위험)",
    text: "2,000 USDD와 2,500 TRX를 180일 동안 최대한 높은 이율로 굴리고 싶습니다. 중간 수준의 변동성은 감수할 수 있습니다.",
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
  const [lastProvider, setLastProvider] = useState<string | null>(null);

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
    if (!inputText.trim() || isAnalyzing) return;
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
        setLastProvider(data.provider || "gemini");
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

  const riskKoreanMap: Record<string, string> = {
    LOW: "저위험 (원금 보호 중심)",
    MEDIUM: "중위험 (균형 수익)",
    HIGH: "고위험 (수익 극대화)",
  };

  return (
    <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-500 flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                AI 투자 목표 분석
              </h2>
              {lastProvider === "gemini" && (
                <span className="text-[11px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                  Gemini 2.5 Flash
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              원하는 목표를 편하게 입력하시면, AI가 맞춤 재무 조건으로 정형화합니다.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsManualMode(!isManualMode)}
          className="text-xs px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-1.5 transition-colors font-medium cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{isManualMode ? "자연어 모드로 전환" : "조건 직접 수정"}</span>
        </button>
      </div>

      {/* Preset Quick Chips */}
      {!isManualMode && (
        <div className="space-y-2">
          <span className="text-xs text-slate-400 font-medium block">
            빠른 목표 선택:
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESET_PROMPTS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => setInputText(preset.text)}
                className={`text-xs px-3.5 py-2 rounded-xl border transition-all text-left cursor-pointer ${
                  inputText === preset.text
                    ? "bg-slate-900 text-white border-slate-900 font-medium shadow-2xs"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Natural Language Input Form */}
      {!isManualMode && (
        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={3}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pr-32 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-none leading-relaxed"
            placeholder="투자 목표를 편하게 작성해 주세요. 예: 90일 정도 굴리고 싶고, 최소 300달러는 언제든 뺄 수 있게 남겨두고 싶어요..."
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !inputText.trim()}
            className="absolute right-3 bottom-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>분석 중...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>AI 분석하기</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Clarification Follow-up Question Banner */}
      {followUpQuestion && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-3">
          <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block text-amber-900 mb-0.5">
              AI 제약조건 확인 질문:
            </strong>
            <p className="leading-relaxed">{followUpQuestion}</p>
          </div>
        </div>
      )}

      {/* Structured Summary Card (4 Metric Boxes) */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              분석된 맞춤 조건 (Needs Profile)
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            엔진 배분 시 하드 제약으로 엄격히 적용됩니다
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Item 1: Horizon */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 space-y-1 shadow-2xs">
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>운용 기간</span>
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
                className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg px-2 py-1 mt-0.5 focus:outline-none w-full font-medium"
              >
                <option value={30}>30일 (단기)</option>
                <option value={90}>90일 (표준)</option>
                <option value={180}>180일 (중기)</option>
                <option value={365}>365일 (장기)</option>
              </select>
            ) : (
              <div className="text-lg font-bold text-slate-900 font-mono">
                {editableProfile.horizonDays}일
              </div>
            )}
            <span className="text-[11px] text-slate-400 block">복리 수익 산정 기준</span>
          </div>

          {/* Item 2: Minimum Liquid Reserve */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 space-y-1 shadow-2xs">
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>최소 상시 비상금</span>
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
                className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg px-2 py-1 mt-0.5 focus:outline-none w-full font-mono font-medium"
              />
            ) : (
              <div className="text-lg font-bold text-emerald-600 font-mono">
                ${editableProfile.minimumLiquidUsd}
              </div>
            )}
            <span className="text-[11px] text-slate-400 block">예치 금지, 상시 인출 가능</span>
          </div>

          {/* Item 3: Risk Level */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 space-y-1 shadow-2xs">
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <Target className="w-3.5 h-3.5 text-amber-500" />
              <span>위험 성향</span>
            </span>
            {isManualMode ? (
              <select
                value={editableProfile.riskLevel}
                onChange={(e) =>
                  setEditableProfile({
                    ...editableProfile,
                    riskLevel: e.target.value as any,
                  })
                }
                className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg px-2 py-1 mt-0.5 focus:outline-none w-full font-medium"
              >
                <option value="LOW">저위험 (안전)</option>
                <option value="MEDIUM">중위험 (균형)</option>
                <option value="HIGH">고위험 (적극)</option>
              </select>
            ) : (
              <div className="text-base font-bold text-slate-900">
                {riskKoreanMap[editableProfile.riskLevel] || editableProfile.riskLevel}
              </div>
            )}
            <span className="text-[11px] text-slate-400 block">원금 보존 우선 원칙</span>
          </div>

          {/* Item 4: Max Volatile Exposure */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 space-y-1 shadow-2xs">
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <DollarSign className="w-3.5 h-3.5 text-purple-500" />
              <span>최대 변동성 노출</span>
            </span>
            <div className="text-lg font-bold text-slate-900 font-mono">
              {(parseFloat(editableProfile.maxVolatileExposurePct) * 100).toFixed(0)}% 이내
            </div>
            <span className="text-[11px] text-slate-400 block">TRX 가격 변동 리스크 제한</span>
          </div>
        </div>

        {/* Primary Action Button: Confirm and proceed */}
        <div className="flex items-center justify-end pt-2">
          <button
            onClick={() => onProfileConfirmed(editableProfile)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-2 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>이 조건으로 2개 추천 플랜 계산하기</span>
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>
    </section>
  );
}
