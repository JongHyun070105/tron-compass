"use client";

import React from "react";
import { Check } from "lucide-react";

export type JourneyStep = 1 | 2 | 3 | 4 | 5;

interface JourneyStepperProps {
  currentStep: JourneyStep;
  onSelectStep: (step: JourneyStep) => void;
}

const STEPS = [
  { id: 1 as JourneyStep, number: "1", title: "내 자산", desc: "보유 현황 확인" },
  { id: 2 as JourneyStep, number: "2", title: "목표 분석", desc: "AI 제약 도출" },
  { id: 3 as JourneyStep, number: "3", title: "플랜 비교", desc: "안정형 vs 수익형" },
  { id: 4 as JourneyStep, number: "4", title: "안전 실행", desc: "Nile 테스트넷 서명" },
  { id: 5 as JourneyStep, number: "5", title: "사후 관리", desc: "리밸런싱 모니터링" },
];

export function JourneyStepper({ currentStep, onSelectStep }: JourneyStepperProps) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs">
      <div className="flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          const isPassed = currentStep > step.id;

          return (
            <button
              key={step.id}
              onClick={() => onSelectStep(step.id)}
              className={`flex-1 min-w-[140px] flex items-center gap-3 p-2.5 rounded-xl transition-all text-left cursor-pointer ${
                isActive
                  ? "bg-slate-900 text-white shadow-xs font-semibold"
                  : isPassed
                  ? "bg-slate-50 hover:bg-slate-100 text-slate-700"
                  : "hover:bg-slate-50 text-slate-500"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  isActive
                    ? "bg-red-600 text-white"
                    : isPassed
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200/80 text-slate-600"
                }`}
              >
                {isPassed ? <Check className="w-4 h-4 stroke-[2.5]" /> : step.number}
              </div>

              <div className="overflow-hidden">
                <span
                  className={`block text-xs truncate ${
                    isActive ? "text-white font-bold" : "text-slate-800 font-semibold"
                  }`}
                >
                  {step.title}
                </span>
                <span
                  className={`block text-[11px] truncate ${
                    isActive ? "text-slate-300" : "text-slate-600"
                  }`}
                >
                  {step.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
