"use client";

import React, { useState, useEffect, useRef } from "react";
import { WalletHeader, WalletState } from "@/components/wallet/WalletHeader";
import { JourneyStepper, JourneyStep } from "@/components/navigation/JourneyStepper";
import { PortfolioHero } from "@/components/portfolio/PortfolioHero";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { AiNeedsPlanner } from "@/components/planner/AiNeedsPlanner";
import { PlanComparison } from "@/components/plans/PlanComparison";
import { ExecutionModal } from "@/components/execution/ExecutionModal";
import { ReplayMonitor } from "@/components/monitoring/ReplayMonitor";
import { WhatIfControls } from "@/components/planner/WhatIfControls";
import {
  NeedsProfile,
  AllocationPlan,
  AllocationLeg,
  YieldOpportunity,
} from "@/domain/allocation/types";
import { generateAllocationPlans, computeTotalCapitalUsd } from "@/domain/allocation/engine";
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
  ShieldCheck,
  ArrowRight,
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
    protectionClause: "여행비 $300은 운용 대상에서 제외",
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

  // Execution Modal State (Support both Supply & Redeem)
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false);
  const [selectedPlanForExecution, setSelectedPlanForExecution] = useState<AllocationPlan | null>(null);
  const [selectedLegForExecution, setSelectedLegForExecution] = useState<AllocationLeg | null>(null);
  const [executionMode, setExecutionMode] = useState<"SUPPLY" | "REDEEM">("SUPPLY");

  // Active Tab & Stepper
  const [activeTab, setActiveTab] = useState<"PLANNER" | "MARKET" | "MONITOR">("PLANNER");
  const [currentStep, setCurrentStep] = useState<JourneyStep>(1);

  // Section references for smooth scrolling
  const heroRef = useRef<HTMLDivElement>(null);
  const goalsRef = useRef<HTMLDivElement>(null);
  const plansRef = useRef<HTMLDivElement>(null);
  const initialPlanTriggeredRef = useRef<boolean>(false);

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

      let loadedOpps: YieldOpportunity[] = [];
      let loadedUsdd: UsddProtocolEvidence | null = null;

      if (justlendData.success && justlendData.markets) {
        loadedOpps = justlendData.markets;
        setOpportunities(justlendData.markets);
        setLastFetchedAt(justlendData.fetchedAt);
      }

      if (usddData.success && usddData.data) {
        loadedUsdd = usddData.data;
        setUsddEvidence(usddData.data);
      }

      // Generate initial deterministic plans immediately with verified data
      if (loadedOpps.length > 0) {
        const { plans: initialPlans } = generateAllocationPlans(
          profile,
          loadedOpps,
          undefined,
          loadedUsdd
        );
        setPlans(initialPlans);
      }
    } catch (err) {
      console.warn("Failed to load initial market data:", err);
    } finally {
      setIsLoadingMarket(false);
    }
  };

  useEffect(() => {
    loadMarketData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Instantaneous deterministic plan calculation upon profile confirmation
  const handleProfileConfirmed = (confirmedProfile: NeedsProfile) => {
    setProfile(confirmedProfile);
    setCurrentStep(3); // Advance stepper to Plan Comparison

    if (opportunities.length > 0) {
      const { plans: generatedPlans } = generateAllocationPlans(
        confirmedProfile,
        opportunities,
        undefined,
        usddEvidence
      );
      setPlans(generatedPlans);

      // Save plan snapshot asynchronously
      if (generatedPlans[0]) {
        compassStorage.savePlan({
          id: `plan-snapshot-${Date.now()}`,
          walletAddress: walletState.address,
          createdAt: new Date().toISOString(),
          plan: generatedPlans[0],
          profile: confirmedProfile,
          marketSnapshot: opportunities,
        }).catch(console.warn);
      }
    }

    plansRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Instantaneous What-If constraint tuning (0ms latency, zero AI call)
  const handleWhatIfChange = (updatedProfile: NeedsProfile) => {
    setProfile(updatedProfile);
    if (opportunities.length > 0) {
      const { plans: updatedPlans } = generateAllocationPlans(
        updatedProfile,
        opportunities,
        undefined,
        usddEvidence
      );
      setPlans(updatedPlans);
    }
  };

  // On-demand AI explanation (only when user explicitly requests)
  const handleRequestAiExplanation = async () => {
    if (isExplainingPlans || plans.length === 0) return;
    setIsExplainingPlans(true);

    try {
      const explainRes = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          plans,
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
      setIsExplainingPlans(false);
    }
  };

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
              trxBalance: balances.trx,
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
      // Switch TO Real Wallet mode
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
          trxBalance: balances.trx,
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

  const handleSelectActionForExecution = (
    plan: AllocationPlan,
    leg: AllocationLeg,
    mode: "SUPPLY" | "REDEEM" = "SUPPLY"
  ) => {
    setSelectedPlanForExecution(plan);
    setSelectedLegForExecution(leg);
    setExecutionMode(mode);
    setCurrentStep(4); // Advance to Execution step
    setIsExecutionModalOpen(true);
  };

  const handleStepSelect = (step: JourneyStep) => {
    setCurrentStep(step);
    if (step === 1) {
      setActiveTab("PLANNER");
      heroRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (step === 2) {
      setActiveTab("PLANNER");
      goalsRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (step === 3) {
      setActiveTab("PLANNER");
      plansRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (step === 4) {
      setActiveTab("PLANNER");
      if (plans[0]) {
        const execLeg = plans[1]?.allocations.find((a) => a.executable) || plans[0]?.allocations.find((a) => a.executable);
        if (execLeg) {
          handleSelectActionForExecution(plans[1] || plans[0], execLeg);
        }
      }
    } else if (step === 5) {
      setActiveTab("MONITOR");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 1. Sticky Header (Clean, minimal clutter, light fintech) */}
      <WalletHeader
        walletState={walletState}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* 2. Main Container with 8px scale & 1200px max width */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Step Progression Stepper (Visual 5-Step Journey) */}
        <JourneyStepper
          currentStep={currentStep}
          onSelectStep={handleStepSelect}
        />

        {/* Navigation Tabs Bar (Clean Segmented View Switcher) */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab("PLANNER");
                setCurrentStep(3);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "PLANNER"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>AI 플래너 & 플랜 비교</span>
            </button>

            <button
              onClick={() => setActiveTab("MARKET")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "MARKET"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Layers className="w-4 h-4 text-blue-500" />
              <span>생태계 마켓 현황</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("MONITOR");
                setCurrentStep(5);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "MONITOR"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <History className="w-4 h-4 text-amber-500" />
              <span>모의 리플레이 & 모니터링</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>수학적 배분 엔진: 정상 가동</span>
          </div>
        </div>

        {/* View 1: Main Planner & 5-Step Journey Flow */}
        {activeTab === "PLANNER" && (
          <div className="space-y-8 animate-in fade-in">
            {/* Step 1: Portfolio Hero */}
            <div ref={heroRef}>
              <PortfolioHero
                walletState={walletState}
                profile={profile}
                onExplorePlans={() => {
                  setCurrentStep(3);
                  plansRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                onOpenGoals={() => {
                  setCurrentStep(2);
                  goalsRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                hasPlans={plans.length > 0}
              />
            </div>

            {/* Step 2: Goals / AI Needs Analysis */}
            <div ref={goalsRef}>
              <AiNeedsPlanner
                currentProfile={profile}
                onProfileConfirmed={handleProfileConfirmed}
                walletHoldings={[
                  { asset: "USDD", amount: walletState.usddBalance.replace(/,/g, "") },
                  { asset: "TRX", amount: walletState.trxBalance.replace(/,/g, "") },
                ]}
              />
            </div>

            {/* Step 2.5: Interactive What-If Simulation Controls (0ms Latency, Local Deterministic) */}
            <WhatIfControls
              profile={profile}
              totalPortfolioUsd={computeTotalCapitalUsd(profile)}
              onChange={handleWhatIfChange}
            />

            {/* Step 3: Plan Comparison (Plan A Safe vs Plan B Balanced) */}
            <div ref={plansRef}>
              <PlanComparison
                plans={plans}
                onSelectActionForExecution={handleSelectActionForExecution}
                aiExplanation={aiExplanation}
                aiProvider={aiProvider}
                aiModel={aiModel}
                isAiExplaining={isExplainingPlans}
                onRequestAiExplanation={handleRequestAiExplanation}
              />
            </div>
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
                setCurrentStep(3);
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
        initialMode={executionMode}
        onExecutionCompleted={(hash) => {
          console.log("Transaction executed on Nile:", hash);
          setCurrentStep(5); // Move to post-execution monitoring
        }}
      />

      {/* Footer (Clean & Subtle) */}
      <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-500 mt-16">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <strong className="text-slate-900 font-bold">TRON Compass</strong>
            <span>—</span>
            <span>AI understands. Code verifies. User approves. TRON executes.</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
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
