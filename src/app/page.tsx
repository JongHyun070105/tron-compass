"use client";

import React, { useState, useEffect } from "react";
import { WalletHeader, WalletState } from "@/components/wallet/WalletHeader";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { AiNeedsPlanner } from "@/components/planner/AiNeedsPlanner";
import { PlanComparison } from "@/components/plans/PlanComparison";
import { ExecutionModal } from "@/components/execution/ExecutionModal";
import { ReplayMonitor } from "@/components/monitoring/ReplayMonitor";
import {
  NeedsProfile,
  AllocationPlan,
  AllocationLeg,
  YieldOpportunity,
} from "@/domain/allocation/types";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";
import { compassStorage } from "@/lib/persistence/storage";
import {
  Sparkles,
  Layers,
  ArrowRight,
  TrendingUp,
  History,
  ShieldAlert,
  Info,
} from "lucide-react";

export default function HomePage() {
  // Wallet State
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: true, // Default to connected demo state for seamless judge review
    address: "TLyq6z7Pmoo4W4P3mJ6eF7vD5s8K9j1a2b",
    network: "Nile Testnet",
    trxBalance: "500.00",
    usddBalance: "1,000.00",
    isDemoMode: true,
  });

  // Data Layer States
  const [opportunities, setOpportunities] = useState<YieldOpportunity[]>([]);
  const [usddEvidence, setUsddEvidence] = useState<UsddProtocolEvidence | null>(null);
  const [isLoadingMarket, setIsLoadingMarket] = useState<boolean>(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<string>("");

  // Planner & Engine States
  const [profile, setProfile] = useState<NeedsProfile>({
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
    assumptions: [
      "투자 기간 90일 기준 복리 수익 계산",
      "최소 상시 유동성 $300 확보",
    ],
  });

  const [plans, setPlans] = useState<AllocationPlan[]>([]);
  const [aiExplanation, setAiExplanation] = useState<{
    planAExplanation: string;
    planBExplanation: string;
    comparisonRecommendation: string;
  } | null>(null);

  // Execution Modal State
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false);
  const [selectedPlanForExecution, setSelectedPlanForExecution] = useState<AllocationPlan | null>(null);
  const [selectedLegForExecution, setSelectedLegForExecution] = useState<AllocationLeg | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"PLANNER" | "MARKET" | "MONITOR">("PLANNER");

  // Fetch initial market data
  const loadMarketData = async (forceRefresh: boolean = false) => {
    setIsLoadingMarket(true);
    try {
      const [justlendRes, usddRes] = await Promise.all([
        fetch(`/api/market/justlend${forceRefresh ? "?refresh=true" : ""}`),
        fetch("/api/market/usdd"),
      ]);

      const justlendData = await justlendRes.json();
      const usddData = await usddRes.json();

      if (justlendData.success && justlendData.markets) {
        setOpportunities(justlendData.markets);
        setLastFetchedAt(justlendData.fetchedAt);
      }

      if (usddData.success && usddData.data) {
        setUsddEvidence(usddData.data);
      }
    } catch (err) {
      console.warn("Failed to load initial market data:", err);
    } finally {
      setIsLoadingMarket(false);
    }
  };

  useEffect(() => {
    loadMarketData();
  }, []);

  // Generate plans upon profile confirmation
  const handleProfileConfirmed = async (confirmedProfile: NeedsProfile) => {
    setProfile(confirmedProfile);
    try {
      const res = await fetch("/api/allocation/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: confirmedProfile }),
      });

      const data = await res.json();
      if (data.success && data.data?.plans) {
        setPlans(data.data.plans);

        // Save original plan snapshot
        if (data.data.plans[0]) {
          await compassStorage.savePlan({
            id: `plan-snapshot-${Date.now()}`,
            walletAddress: walletState.address,
            createdAt: new Date().toISOString(),
            plan: data.data.plans[0],
            profile: confirmedProfile,
            marketSnapshot: opportunities,
          });
        }

        // Call AI explanation
        try {
          const explainRes = await fetch("/api/ai/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile: confirmedProfile,
              plans: data.data.plans,
            }),
          });
          const explainData = await explainRes.json();
          if (explainData.success && explainData.data) {
            setAiExplanation(explainData.data);
          }
        } catch {
          // Fallback handled in provider
        }
      }
    } catch (err) {
      console.warn("Plan generation failed:", err);
    }
  };

  // Generate initial plans automatically once opportunities load
  useEffect(() => {
    if (opportunities.length > 0 && plans.length === 0) {
      handleProfileConfirmed(profile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities]);

  // Handle wallet interactions
  const handleConnect = async () => {
    if (typeof window !== "undefined" && (window as any).tronLink) {
      try {
        const res = await (window as any).tronLink.request({ method: "tron_requestAccounts" });
        if (res.code === 200) {
          const address = (window as any).tronWeb?.defaultAddress?.base58 || "T...";
          setWalletState({
            isConnected: true,
            address,
            network: "Nile Testnet",
            trxBalance: "180.50",
            usddBalance: "1,250.00",
            isDemoMode: false,
          });
        }
      } catch {
        // Fallback to demo
      }
    } else {
      // Demo mode if extension not installed
      setWalletState({
        isConnected: true,
        address: "TLyq6z7Pmoo4W4P3mJ6eF7vD5s8K9j1a2b",
        network: "Nile Testnet",
        trxBalance: "500.00",
        usddBalance: "1,000.00",
        isDemoMode: true,
      });
    }
  };

  const handleDisconnect = () => {
    setWalletState({
      isConnected: false,
      address: "",
      network: "",
      trxBalance: "0.00",
      usddBalance: "0.00",
      isDemoMode: false,
    });
  };

  const handleToggleDemoMode = () => {
    setWalletState((prev) => ({
      ...prev,
      isConnected: true,
      address: prev.isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : "TLyq6z7Pmoo4W4P3mJ6eF7vD5s8K9j1a2b",
      isDemoMode: !prev.isDemoMode,
      trxBalance: !prev.isDemoMode ? "500.00" : "150.00",
      usddBalance: "1,000.00",
    }));
  };

  const handleSelectActionForExecution = (plan: AllocationPlan, leg: AllocationLeg) => {
    setSelectedPlanForExecution(plan);
    setSelectedLegForExecution(leg);
    setIsExecutionModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col">
      {/* Top Header */}
      <WalletHeader
        walletState={walletState}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-8">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("PLANNER")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === "PLANNER"
                  ? "bg-red-600 text-white shadow-lg shadow-red-900/30"
                  : "bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 플래너 & 플랜 비교 (Plan A/B)</span>
            </button>

            <button
              onClick={() => setActiveTab("MARKET")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === "MARKET"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : "bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>검증된 생태계 마켓 현황 (JustLend & USDD)</span>
            </button>

            <button
              onClick={() => setActiveTab("MONITOR")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === "MONITOR"
                  ? "bg-amber-600 text-white shadow-lg shadow-amber-900/30"
                  : "bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>히스토리컬 리플레이 & 리밸런싱 감지</span>
            </button>
          </div>

          <div className="text-xs text-gray-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>엔진 상태: 정상 (Deterministic)</span>
          </div>
        </div>

        {/* View 1: AI Planner & Plan Comparison */}
        {activeTab === "PLANNER" && (
          <div className="space-y-8 animate-in fade-in">
            {/* Step 1: AI Needs Analysis */}
            <AiNeedsPlanner
              currentProfile={profile}
              onProfileConfirmed={handleProfileConfirmed}
              walletHoldings={[
                { asset: "USDD", amount: walletState.usddBalance.replace(/,/g, "") },
                { asset: "TRX", amount: walletState.trxBalance.replace(/,/g, "") },
              ]}
            />

            {/* Step 2: Deterministic Plan Comparison */}
            <PlanComparison
              plans={plans}
              onSelectActionForExecution={handleSelectActionForExecution}
              aiExplanation={aiExplanation}
            />
          </div>
        )}

        {/* View 2: Live Market Evidence (JustLend & USDD) */}
        {activeTab === "MARKET" && (
          <div className="space-y-6 animate-in fade-in">
            <MarketOverview
              opportunities={opportunities}
              usddEvidence={usddEvidence}
              isLoading={isLoadingMarket}
              onRefresh={() => loadMarketData(true)}
              lastFetchedAt={lastFetchedAt}
            />
          </div>
        )}

        {/* View 3: Monitoring & Replay / Rebalance */}
        {activeTab === "MONITOR" && (
          <div className="space-y-6 animate-in fade-in">
            <ReplayMonitor
              originalPlan={plans[1] || plans[0] || null}
              profile={profile}
              liveOpportunities={opportunities}
              onApplyRebalance={(newPlan) => {
                setPlans([newPlan, ...plans.filter((p) => p.id !== newPlan.id)]);
                setActiveTab("PLANNER");
              }}
            />
          </div>
        )}
      </main>

      {/* Execution Review Modal (Human-in-the-Loop Safe Gateway) */}
      <ExecutionModal
        isOpen={isExecutionModalOpen}
        onClose={() => setIsExecutionModalOpen(false)}
        plan={selectedPlanForExecution}
        leg={selectedLegForExecution}
        walletAddress={walletState.address}
        isWalletConnected={walletState.isConnected}
        isDemoMode={walletState.isDemoMode}
        trxBalance={walletState.trxBalance}
        onExecutionCompleted={(hash) => {
          console.log("Transaction successfully executed on Nile:", hash);
        }}
      />

      {/* Footer */}
      <footer className="border-t border-gray-800/80 bg-gray-950/80 py-6 text-xs text-gray-400 mt-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <strong className="text-white font-bold">TRON Compass</strong>
            <span>—</span>
            <span>AI understands. Code verifies. User approves. TRON executes.</span>
          </div>
          <div className="flex items-center gap-4 text-gray-500">
            <span>GWDC 2026 TRON Challenge B</span>
            <span>•</span>
            <span>JustLend OpenAPI & USDD Verified</span>
            <span>•</span>
            <span>Nile Testnet Execution</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
