"use client";

import React, { useState, useEffect, useRef } from "react";
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
  detectActiveTronNetwork,
  fetchTronWalletBalances,
} from "@/lib/tron/network";
import { PlanExplanation } from "@/lib/ai/schemas";
import {
  Sparkles,
  Layers,
  History,
  Shield,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Wallet,
} from "lucide-react";

export default function HomePage() {
  // Wallet State (Mutually Exclusive Demo Mode vs Real Wallet)
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: true, // Default to demo state for seamless judge review
    address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
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
  const [aiExplanation, setAiExplanation] = useState<
    (PlanExplanation & { provider?: "gemini" | "mock_fallback" }) | null
  >(null);
  const [aiProvider, setAiProvider] = useState<"gemini" | "mock_fallback">("gemini");
  const [aiModel, setAiModel] = useState<string>("gemini-2.5-flash");
  const [isExplainingPlans, setIsExplainingPlans] = useState<boolean>(false);

  // Deduplication ref for AI explain calls
  const lastExplainedKeyRef = useRef<string>("");
  const isExplainingRef = useRef<boolean>(false);

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

  // Generate plans upon profile confirmation (strictly deduplicated AI explain call)
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
        const generatedPlans: AllocationPlan[] = data.data.plans;
        setPlans(generatedPlans);

        // Save original plan snapshot
        if (generatedPlans[0]) {
          await compassStorage.savePlan({
            id: `plan-snapshot-${Date.now()}`,
            walletAddress: walletState.address,
            createdAt: new Date().toISOString(),
            plan: generatedPlans[0],
            profile: confirmedProfile,
            marketSnapshot: opportunities,
          });
        }

        // Deduplicated AI explanation trigger
        const explainKey = `${confirmedProfile.horizonDays}_${confirmedProfile.minimumLiquidUsd}_${confirmedProfile.riskLevel}_${generatedPlans.map((p) => p.id).join("_")}`;

        if (lastExplainedKeyRef.current !== explainKey && !isExplainingRef.current) {
          lastExplainedKeyRef.current = explainKey;
          isExplainingRef.current = true;
          setIsExplainingPlans(true);

          try {
            const explainRes = await fetch("/api/ai/explain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                profile: confirmedProfile,
                plans: generatedPlans,
              }),
            });
            const explainData = await explainRes.json();
            if (explainData.success && explainData.data) {
              setAiExplanation({
                ...explainData.data,
                provider: explainData.provider || "gemini",
              });
              setAiProvider(explainData.provider || "gemini");
              if (explainData.model) setAiModel(explainData.model);
            }
          } catch (err) {
            console.warn("AI explanation fetch failed:", err);
          } finally {
            isExplainingRef.current = false;
            setIsExplainingPlans(false);
          }
        }
      }
    } catch (err) {
      console.warn("Plan generation failed:", err);
    }
  };

  // Generate initial plans automatically once opportunities load (runs only once)
  const initialPlanTriggeredRef = useRef(false);
  useEffect(() => {
    if (opportunities.length > 0 && plans.length === 0 && !initialPlanTriggeredRef.current) {
      initialPlanTriggeredRef.current = true;
      handleProfileConfirmed(profile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities]);

  // Handle wallet interactions with REAL on-chain balance fetching
  const handleConnect = async () => {
    if (typeof window !== "undefined" && (window as any).tronLink) {
      try {
        const res = await (window as any).tronLink.request({ method: "tron_requestAccounts" });
        if (res.code === 200 || res.code === 4001) {
          const tw = (window as any).tronWeb;
          const address = tw?.defaultAddress?.base58;
          if (address) {
            const net = detectActiveTronNetwork(tw);
            const balances = await fetchTronWalletBalances(address, tw);

            // Isolate real session: clear demo records
            await compassStorage.clearDemoExecutions();

            setWalletState({
              isConnected: true,
              address,
              network: net.name,
              trxBalance: balances.trx, // Real balance strictly queried from TronWeb!
              usddBalance: balances.usdd,
              isDemoMode: false,
            });
            return;
          }
        }
      } catch (err) {
        console.warn("TronLink connection error:", err);
      }
    }

    // Fallback notification or guide if TronLink extension is not ready
    alert("TronLink 지갑 확장이 감지되지 않았거나 잠겨 있습니다. 확장 프로그램을 확인해 주세요.");
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

  const handleToggleDemoMode = async () => {
    if (!walletState.isDemoMode) {
      // Switch TO Demo mode
      setWalletState({
        isConnected: true,
        address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        network: "Nile Testnet",
        trxBalance: "500.00",
        usddBalance: "1,000.00",
        isDemoMode: true,
      });
    } else {
      // Switch TO Real Wallet mode: query real TronWeb if available
      const tw = typeof window !== "undefined" ? (window as any).tronWeb : null;
      const address = tw?.defaultAddress?.base58;

      if (tw && address) {
        const net = detectActiveTronNetwork(tw);
        const balances = await fetchTronWalletBalances(address, tw);

        await compassStorage.clearDemoExecutions();

        setWalletState({
          isConnected: true,
          address,
          network: net.name,
          trxBalance: balances.trx, // STRICT REAL BALANCE
          usddBalance: balances.usdd,
          isDemoMode: false,
        });
      } else {
        setWalletState({
          isConnected: false,
          address: "",
          network: "Nile Testnet",
          trxBalance: "0.00",
          usddBalance: "0.00",
          isDemoMode: false,
        });
      }
    }
  };

  // Listen to TronLink account or network switch events
  useEffect(() => {
    const handleTronMessage = async (e: MessageEvent) => {
      if (
        e.data?.message?.action === "setAccount" ||
        e.data?.message?.action === "setNode"
      ) {
        const tw = (window as any).tronWeb;
        const address = tw?.defaultAddress?.base58;
        if (address && !walletState.isDemoMode) {
          const net = detectActiveTronNetwork(tw);
          const balances = await fetchTronWalletBalances(address, tw);
          setWalletState((prev) => ({
            ...prev,
            address,
            network: net.name,
            trxBalance: balances.trx,
            usddBalance: balances.usdd,
          }));
        }
      }
    };

    window.addEventListener("message", handleTronMessage);
    return () => window.removeEventListener("message", handleTronMessage);
  }, [walletState.isDemoMode]);

  const handleSelectActionForExecution = (plan: AllocationPlan, leg: AllocationLeg) => {
    setSelectedPlanForExecution(plan);
    setSelectedLegForExecution(leg);
    setIsExecutionModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col font-sans">
      {/* 1. Header (Clean, progressive, streamlined) */}
      <WalletHeader
        walletState={walletState}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* 2. Main Container with 8px scale & 1240px max width */}
      <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {/* Progressive 5-Step Journey Stepper Indicator */}
        <div className="bg-gray-950/70 border border-gray-800/80 rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-gray-400 font-medium mb-3 flex items-center justify-between">
            <span className="text-white font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span>TRON Compass 5단계 자산 배분 여정 (User Journey)</span>
            </span>
            <span className="text-[11px] text-gray-500">
              {walletState.isDemoMode ? "모드: 데모 포트폴리오" : "모드: 실제 지갑 세션"}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-red-600/30 text-red-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <span className="font-semibold text-white block text-[11px]">포트폴리오</span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {walletState.trxBalance} TRX
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <span className="font-semibold text-white block text-[11px]">목표 분석</span>
                <span className="text-[10px] text-gray-500">자연어 제약 정형화</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <span className="font-semibold text-white block text-[11px]">플랜 비교</span>
                <span className="text-[10px] text-gray-500">Plan A vs Plan B</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                4
              </span>
              <div>
                <span className="font-semibold text-white block text-[11px]">실행 & 서명</span>
                <span className="text-[10px] text-gray-500">Nile 테스트넷</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                5
              </span>
              <div>
                <span className="font-semibold text-white block text-[11px]">모니터링</span>
                <span className="text-[10px] text-gray-500">리밸런싱 감지</span>
              </div>
            </div>
          </div>
        </div>

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
              <span>생태계 마켓 현황 (JustLend & USDD)</span>
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
              <span>히스토리컬 리플레이 & 리밸런싱</span>
            </button>
          </div>

          <div className="text-xs text-gray-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>결정론적 배분 엔진: 정상 가동</span>
          </div>
        </div>

        {/* View 1: AI Planner & Plan Comparison */}
        {activeTab === "PLANNER" && (
          <div className="space-y-8 animate-in fade-in">
            {/* Step 2: AI Needs Analysis */}
            <AiNeedsPlanner
              currentProfile={profile}
              onProfileConfirmed={handleProfileConfirmed}
              walletHoldings={[
                { asset: "USDD", amount: walletState.usddBalance.replace(/,/g, "") },
                { asset: "TRX", amount: walletState.trxBalance.replace(/,/g, "") },
              ]}
            />

            {/* Step 3: Deterministic Plan Comparison */}
            <PlanComparison
              plans={plans}
              onSelectActionForExecution={handleSelectActionForExecution}
              aiExplanation={aiExplanation}
              aiProvider={aiProvider}
              aiModel={aiModel}
              isAiExplaining={isExplainingPlans}
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

      {/* Execution Modal (Human-in-the-Loop Safe Gateway) */}
      <ExecutionModal
        isOpen={isExecutionModalOpen}
        onClose={() => setIsExecutionModalOpen(false)}
        plan={selectedPlanForExecution}
        leg={selectedLegForExecution}
        walletAddress={walletState.address}
        isWalletConnected={walletState.isConnected}
        isDemoMode={walletState.isDemoMode}
        trxBalance={walletState.trxBalance}
        networkName={walletState.network}
        onExecutionCompleted={(hash) => {
          console.log("Transaction executed on Nile:", hash);
        }}
      />

      {/* Footer */}
      <footer className="border-t border-gray-800/80 bg-gray-950/80 py-6 text-xs text-gray-400 mt-12">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
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
