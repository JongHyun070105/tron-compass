"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { WalletHeader, WalletState } from "@/components/wallet/WalletHeader";
import { JourneyStepper, JourneyStep } from "@/components/navigation/JourneyStepper";
import { PortfolioHero } from "@/components/portfolio/PortfolioHero";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { AiNeedsPlanner } from "@/components/planner/AiNeedsPlanner";
import { PlanComparison } from "@/components/plans/PlanComparison";
import { ExecutionModal } from "@/components/execution/ExecutionModal";
import { ReplayMonitor } from "@/components/monitoring/ReplayMonitor";
import { WhatIfControls } from "@/components/planner/WhatIfControls";
import { DecisionReceiptPanel } from "@/components/decision/DecisionReceiptPanel";
import {
  NeedsProfile,
  AllocationPlan,
  AllocationLeg,
  YieldOpportunity,
} from "@/domain/allocation/types";
import { generateAllocationPlans, computeTotalCapitalValue } from "@/domain/allocation/engine";
import { classifyPlanExecutability } from "@/domain/allocation/executability";
import { hasCompleteValuation, valueUserDeclaredHoldings } from "@/domain/allocation/valuation";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";
import { compassStorage } from "@/lib/persistence/storage";
import {
  buildDecisionAssumptions,
  buildDecisionEvidence,
  buildDecisionScreening,
  createChildDecisionReceipt,
  createDecisionReceipt,
  DecisionReceipt,
  DecisionStopRecord,
  makeStopRecord,
  refreshDecisionReceiptIntegrity,
  evaluateDecisionAssumptions,
} from "@/domain/decision/receipt";
import { buildInvestmentRules, evaluateDecisionRules } from "@/domain/allocation/rules";
import {
  detectWalletNetwork,
  readWalletBalanceSnapshot,
  WalletBalanceSnapshot,
} from "@/lib/tron/wallet-state";
import {
  getTronLinkProvider,
  getWalletTronWeb,
  requestTronLinkAccount,
  subscribeToTronLinkEvents,
} from "@/lib/tron/tronlink-provider";
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
      {
        asset: "USDD",
        amount: "1000",
        origin: "SIMULATED",
        valuation: {
          asset: "USDD",
          amount: "1000",
          value: "1000",
          denomination: "USDT",
          source: "TRON Compass demo fixture",
          fetchedAt: null,
          reality: "SIMULATED",
          stale: false,
          derivation: "Synthetic portfolio value for the local demo; not a market quote.",
        },
      },
      {
        asset: "TRX",
        amount: "2000",
        origin: "SIMULATED",
        valuation: {
          asset: "TRX",
          amount: "2000",
          value: "500",
          denomination: "USDT",
          source: "TRON Compass demo fixture",
          fetchedAt: null,
          reality: "SIMULATED",
          stale: false,
          derivation: "Synthetic portfolio value for the local demo; not a market quote.",
        },
      },
    ],
    horizonDays: 90,
    minimumLiquidUsdtEquivalent: "300",
    riskLevel: "LOW",
    maxVolatileExposurePct: "0.20",
    goal: "BALANCED",
    protectionClause: "여행비 300 USDT-equivalent는 운용 대상에서 제외",
    missingFields: [],
    assumptions: [
      "투자 기간 90일 기준 복리 수익 계산",
      "최소 상시 유동성 300 USDT-equivalent 확보",
    ],
    sourceQuote: "여행비 300 USDT-equivalent는 남겨두고 코인 변동성은 낮게 유지하고 싶어.",
  });
  const [confirmedProfile, setConfirmedProfile] = useState<NeedsProfile | null>(null);

  const [plans, setPlans] = useState<AllocationPlan[]>([]);
  const [aiExplanation, setAiExplanation] = useState<
    (PlanExplanation & { provider?: "gemini" | "mock_fallback" }) | null
  >(null);
  const [aiProvider, setAiProvider] = useState<"gemini" | "mock_fallback">("gemini");
  const [aiModel, setAiModel] = useState<string>("gemini-2.5-flash");
  const [isExplainingPlans, setIsExplainingPlans] = useState<boolean>(false);

  // Execution Modal State (Support both Supply & Redeem)
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false);
  const [jTrxBalance, setJTrxBalance] = useState<string | null>("250.00");
  const [isWalletRefreshing, setIsWalletRefreshing] = useState(false);
  const walletRefreshSequenceRef = useRef(0);
  const explicitlyDisconnectedRef = useRef(false);
  const hasAttemptedWalletRestoreRef = useRef(false);
  const manuallySelectedDemoRef = useRef(false);
  const [activeReceipt, setActiveReceipt] = useState<DecisionReceipt | null>(null);
  const [savedReceipts, setSavedReceipts] = useState<DecisionReceipt[]>([]);
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
        fetch(`/api/market/usdd${forceRefresh ? "?refresh=true" : ""}`),
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

  const refreshExecutionEvidence = async () => {
    const [justlendRes, usddRes] = await Promise.all([
      fetch("/api/market/justlend?refresh=true", { cache: "no-store" }),
      fetch("/api/market/usdd?refresh=true", { cache: "no-store" }),
    ]);
    if (!justlendRes.ok || !usddRes.ok) {
      throw new Error("LIVE_VALUATION_REQUIRED_FOR_NEW_EXPOSURE: Mainnet evidence refresh failed.");
    }
    const [justlendData, usddData] = await Promise.all([justlendRes.json(), usddRes.json()]);
    if (!justlendData.success || !Array.isArray(justlendData.markets) || !usddData.success || !usddData.data) {
      throw new Error("LIVE_VALUATION_REQUIRED_FOR_NEW_EXPOSURE: refreshed Mainnet evidence is incomplete.");
    }

    const refreshedOpportunities = justlendData.markets as YieldOpportunity[];
    const refreshedUsddEvidence = usddData.data as UsddProtocolEvidence;
    setOpportunities(refreshedOpportunities);
    setUsddEvidence(refreshedUsddEvidence);
    if (typeof justlendData.fetchedAt === "string") setLastFetchedAt(justlendData.fetchedAt);
    return { opportunities: refreshedOpportunities, usddEvidence: refreshedUsddEvidence };
  };

  useEffect(() => {
    loadMarketData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    compassStorage.getDecisionReceipts().then((receipts) => {
      setSavedReceipts(receipts);
      if (receipts[0]) setActiveReceipt(receipts[0]);
    }).catch(console.warn);
  }, []);

  // Instantaneous deterministic plan calculation upon profile confirmation
  const handleProfileConfirmed = (draftProfile: NeedsProfile, sourceQuote: string) => {
    const now = new Date().toISOString();
    const evaluationAt = Date.parse(now);
    const valuedProfile: NeedsProfile = {
      ...draftProfile,
      holdings: valueUserDeclaredHoldings(draftProfile.holdings, opportunities, evaluationAt),
    };
    const rules = buildInvestmentRules(
      valuedProfile,
      sourceQuote,
      now,
      confirmedProfile?.investmentRules ?? []
    );
    const nextProfile: NeedsProfile = {
      ...valuedProfile,
      sourceQuote,
      investmentRules: rules,
    };
    setConfirmedProfile(nextProfile);
    setProfile(nextProfile);
    setCurrentStep(3); // Advance stepper to Plan Comparison

    if (opportunities.length > 0) {
      const { plans: generatedPlans } = generateAllocationPlans(
        nextProfile,
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
          profile: nextProfile,
          marketSnapshot: opportunities,
        }).catch(console.warn);
      }
    }

    plansRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Local What-if drafts do not amend confirmed rules or create approval authority.
  const handleWhatIfChange = (updatedProfile: NeedsProfile) => {
    const draftProfile = { ...updatedProfile, investmentRules: undefined };
    setProfile(draftProfile);
    if (opportunities.length > 0) {
      const { plans: updatedPlans } = generateAllocationPlans(
        draftProfile,
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
      const { plans: initialPlans } = generateAllocationPlans(profile, opportunities, undefined, usddEvidence);
      setPlans(initialPlans);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities, usddEvidence]);

  const clearRealWalletState = useCallback((network = "") => {
    walletRefreshSequenceRef.current += 1;
    setIsWalletRefreshing(false);
    setJTrxBalance(null);
    setIsExecutionModalOpen(false);
    setSelectedPlanForExecution(null);
    setSelectedLegForExecution(null);
    setWalletState({
      isConnected: false,
      address: "",
      network,
      trxBalance: "UNAVAILABLE",
      usddBalance: "UNAVAILABLE",
      isDemoMode: false,
    });
  }, []);

  const refreshWalletState = useCallback(async (
    options: { address?: string; chainId?: string; forceFresh?: boolean; clearStale?: boolean } = {}
  ): Promise<WalletBalanceSnapshot | null> => {
    if (typeof window === "undefined") return null;
    const provider = getTronLinkProvider();
    const tronWeb = getWalletTronWeb(provider);
    const address = options.address ?? tronWeb?.defaultAddress?.base58 ?? "";
    if (!address) {
      clearRealWalletState();
      return null;
    }

    const network = detectWalletNetwork(tronWeb, options.chainId);
    const refreshSequence = ++walletRefreshSequenceRef.current;
    setIsWalletRefreshing(true);
    if (options.clearStale !== false) {
      setWalletState({
        isConnected: true,
        address,
        network: network.name,
        trxBalance: "UNAVAILABLE",
        usddBalance: "UNAVAILABLE",
        isDemoMode: false,
      });
      setJTrxBalance(null);
    }

    try {
      const snapshot = await readWalletBalanceSnapshot(
        address,
        tronWeb,
        network.id,
        network.name,
        { forceFresh: options.forceFresh !== false }
      );
      if (refreshSequence !== walletRefreshSequenceRef.current) return null;
      setWalletState({
        isConnected: true,
        address: snapshot.address,
        network: snapshot.network,
        trxBalance: snapshot.trxBalance ?? "UNAVAILABLE",
        usddBalance: "UNAVAILABLE",
        isDemoMode: false,
      });
      setJTrxBalance(snapshot.jTrxBalance);
      return snapshot;
    } catch (err) {
      if (refreshSequence === walletRefreshSequenceRef.current) {
        console.warn("Wallet refresh failed:", err);
        setWalletState((previous) => ({
          ...previous,
          isConnected: true,
          address,
          network: network.name,
          trxBalance: "UNAVAILABLE",
          usddBalance: "UNAVAILABLE",
          isDemoMode: false,
        }));
        setJTrxBalance(null);
      }
      return {
        address,
        networkId: network.id,
        network: network.name,
        trxBalance: null,
        jTrxBalance: null,
        exchangeRateRaw: null,
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      if (refreshSequence === walletRefreshSequenceRef.current) setIsWalletRefreshing(false);
    }
  }, [clearRealWalletState]);

  const handleConnect = async () => {
    explicitlyDisconnectedRef.current = false;
    manuallySelectedDemoRef.current = false;
    setIsWalletRefreshing(true);
    try {
      const address = await requestTronLinkAccount();
      if (!address) throw new Error("TronLink did not return an authorized account.");
      await compassStorage.clearDemoExecutions();
      await refreshWalletState({ address, clearStale: true, forceFresh: true });
    } catch (err) {
      console.warn("TronLink connection error:", err);
      setIsWalletRefreshing(false);
      alert("TronLink 연결이 승인되지 않았거나 지갑을 사용할 수 없습니다. 확장 프로그램과 선택 네트워크를 확인해 주세요.");
    }
  };

  const handleDisconnect = () => {
    explicitlyDisconnectedRef.current = true;
    clearRealWalletState();
  };

  const handleToggleDemoMode = async () => {
    if (!walletState.isDemoMode) {
      manuallySelectedDemoRef.current = true;
      setJTrxBalance("250.00");
      setWalletState({
        isConnected: true,
        address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        network: "Nile Testnet",
        trxBalance: "500.00",
        usddBalance: "1,000.00",
        isDemoMode: true,
      });
      setIsWalletRefreshing(false);
      return;
    }
    manuallySelectedDemoRef.current = false;
    clearRealWalletState("연결 대기");
    await handleConnect();
  };

  useEffect(() => {
    const provider = getTronLinkProvider();
    const restoreConnectedWallet = () => {
      if (explicitlyDisconnectedRef.current) return;
      const tronWeb = getWalletTronWeb(provider);
      const address = tronWeb?.defaultAddress?.base58;
      if (address) {
        explicitlyDisconnectedRef.current = false;
        void refreshWalletState({ address, clearStale: true, forceFresh: true });
      }
    };
    const unsubscribe = subscribeToTronLinkEvents(provider, {
      onAccountsChanged: (accounts) => {
        if (!accounts.length) {
          if (walletState.isDemoMode) return;
          explicitlyDisconnectedRef.current = true;
          clearRealWalletState();
          return;
        }
        explicitlyDisconnectedRef.current = false;
        manuallySelectedDemoRef.current = false;
        void refreshWalletState({ address: accounts[0], clearStale: true, forceFresh: true });
      },
      onChainChanged: ({ chainId }) => {
        if (!explicitlyDisconnectedRef.current && !(walletState.isDemoMode && manuallySelectedDemoRef.current)) {
          void refreshWalletState({ chainId, clearStale: true, forceFresh: true });
        }
      },
      onConnect: ({ chainId } = {}) => {
        if (!explicitlyDisconnectedRef.current && !(walletState.isDemoMode && manuallySelectedDemoRef.current)) {
          void refreshWalletState({ chainId, clearStale: true, forceFresh: true });
        }
      },
      onDisconnect: () => {
        if (walletState.isDemoMode) return;
        explicitlyDisconnectedRef.current = true;
        clearRealWalletState();
      },
    });
    const handleWindowFocus = () => {
      if (explicitlyDisconnectedRef.current || manuallySelectedDemoRef.current) return;
      if (walletState.isDemoMode) {
        const tronWeb = getWalletTronWeb(getTronLinkProvider());
        const address = tronWeb?.defaultAddress?.base58;
        if (address) void refreshWalletState({ address, clearStale: true, forceFresh: true });
      } else {
        void refreshWalletState({ clearStale: false, forceFresh: true });
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleWindowFocus();
    };
    if (!hasAttemptedWalletRestoreRef.current) {
      hasAttemptedWalletRestoreRef.current = true;
      restoreConnectedWallet();
    }
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [walletState.isDemoMode, clearRealWalletState, refreshWalletState]);

  const saveReceipt = async (receipt: DecisionReceipt) => {
    const updated = await refreshDecisionReceiptIntegrity(receipt);
    await compassStorage.saveDecisionReceipt(updated);
    setActiveReceipt(updated);
    setSavedReceipts((previous) => [updated, ...previous.filter((item) => item.id !== updated.id)]);
  };

  const createReceiptForPlan = async (
    plan: AllocationPlan,
    decisionProfile: NeedsProfile,
    evidenceOpportunities: YieldOpportunity[],
    parent: DecisionReceipt | null = null,
    assumptions = buildDecisionAssumptions(decisionProfile, plan, evidenceOpportunities, usddEvidence, new Date().toISOString())
  ) => {
    const now = new Date().toISOString();
    const rules = decisionProfile.investmentRules ?? [];
    const alternatives = plans.map((candidate) => ({
      planId: candidate.id,
      allocations: candidate.allocations,
      valuationStatus: candidate.valuationStatus,
      baseYield: candidate.expectedBaseYieldUsdtEquivalent,
      incentiveYield: candidate.expectedIncentiveYieldUsdtEquivalent,
      estimatedCost: candidate.estimatedTotalCostUsdtEquivalent,
      exitCondition: candidate.exitConditions,
      risks: candidate.risks,
      ruleEvaluation: candidate.constraintChecks,
      executionReality: classifyPlanExecutability(candidate.allocations),
    }));
    if (!alternatives.some((item) => item.planId === plan.id)) {
      alternatives.push({
        planId: plan.id,
        allocations: plan.allocations,
        valuationStatus: plan.valuationStatus,
        baseYield: plan.expectedBaseYieldUsdtEquivalent,
        incentiveYield: plan.expectedIncentiveYieldUsdtEquivalent,
        estimatedCost: plan.estimatedTotalCostUsdtEquivalent,
        exitCondition: plan.exitConditions,
        risks: plan.risks,
        ruleEvaluation: plan.constraintChecks,
        executionReality: classifyPlanExecutability(plan.allocations),
      });
    }
    const draft = {
      id: `receipt-${Date.now()}`,
      parentId: parent?.id ?? null,
      createdAt: now,
      horizonDays: decisionProfile.horizonDays,
      rules: { version: Math.max(0, ...rules.map((rule) => rule.version)), items: rules },
      needsConfirmedAt: rules.length ? rules.reduce((latest, rule) => rule.confirmedAt > latest ? rule.confirmedAt : latest, "") : null,
      evidence: buildDecisionEvidence(evidenceOpportunities, usddEvidence, now, decisionProfile),
      screening: buildDecisionScreening(
        decisionProfile,
        evidenceOpportunities,
        plans.some((candidate) => candidate.id === plan.id) ? plans : [...plans, plan]
      ),
      alternatives,
      assumptions,
      selection: { planId: plan.id, selectedAt: now },
      approval: { shown: null, signer: null, approvedAt: null },
    };
    return parent ? createChildDecisionReceipt(parent, draft) : createDecisionReceipt(draft);
  };

  const handleSelectActionForExecution = async (
    plan: AllocationPlan,
    leg: AllocationLeg,
    mode: "SUPPLY" | "REDEEM" = "SUPPLY"
  ) => {
    const decisionProfile = confirmedProfile ?? profile;
    const receipt = await createReceiptForPlan(plan, decisionProfile, opportunities);
    await saveReceipt(receipt);
    setSelectedPlanForExecution(plan);
    setSelectedLegForExecution(leg);
    setExecutionMode(mode);
    setCurrentStep(4); // Advance to Execution step
    setIsExecutionModalOpen(true);
  };

  const handleReplayAssumptions = async (
    scenarioTitle: string,
    assumptions: DecisionReceipt["assumptions"],
    mode: "LIVE" | "SIMULATED"
  ) => {
    if (!activeReceipt) return;
    const reviewedAt = new Date().toISOString();
    const updated = {
      ...activeReceipt,
      reviews: [...activeReceipt.reviews, {
        id: `review-${Date.now()}`,
        reviewedAt,
        title: scenarioTitle,
        mode,
        assumptions,
        proposalPlanId: null,
      }],
    };
    await saveReceipt(updated);
  };

  const handleApplyRebalance = async (
    newPlan: AllocationPlan,
    simulatedOpportunities: YieldOpportunity[],
    reviewedAssumptions: DecisionReceipt["assumptions"]
  ) => {
    const decisionProfile = confirmedProfile ?? profile;
    const sharedEvaluation = evaluateDecisionRules(
      decisionProfile,
      computeTotalCapitalValue(decisionProfile),
      newPlan.allocations,
      simulatedOpportunities
    );
    if (!sharedEvaluation.passed) {
      const failedRule = sharedEvaluation.checks.find((check) => !check.passed);
      if (activeReceipt) {
        const stop: DecisionStopRecord = makeStopRecord({
          timestamp: new Date().toISOString(),
          stage: "REBALANCE",
          ruleId: failedRule?.ruleId ?? null,
          guardId: failedRule?.key ?? "REBALANCE_RULES",
          attemptedAction: "REBALANCE_PROPOSAL",
          attemptedAmount: null,
          reason: failedRule?.detail ?? "The proposed allocation did not pass shared My Rules.",
        });
        await saveReceipt({ ...activeReceipt, stops: [...activeReceipt.stops, stop] });
      }
      return;
    }

    const parent = activeReceipt;
    if (parent) {
      const child = await createReceiptForPlan(newPlan, decisionProfile, simulatedOpportunities, parent, reviewedAssumptions);
      child.reviews.push({
        id: `review-${Date.now()}`,
        reviewedAt: new Date().toISOString(),
        title: "Proposal generated from replayed assumption change",
        mode: "SIMULATED",
        assumptions: reviewedAssumptions,
        proposalPlanId: newPlan.id,
      });
      await saveReceipt(child);
    }
    setPlans((current) => [newPlan, ...current.filter((item) => item.id !== newPlan.id)]);
    setActiveTab("PLANNER");
    setCurrentStep(3);
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
        jTrxBalance={jTrxBalance}
        isRefreshing={isWalletRefreshing}
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
              <span>Talk · My Rules · Compare</span>
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
              <span>Assumption Review · Replay</span>
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
                jTrxBalance={jTrxBalance}
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
                currentProfile={confirmedProfile ?? profile}
                onProfileConfirmed={handleProfileConfirmed}
              />
            </div>

            {/* What-if stays a secondary local simulation and does not amend My Rules. */}
            <WhatIfControls
              profile={profile}
              totalPortfolioUsdtEquivalent={hasCompleteValuation(profile) ? computeTotalCapitalValue(profile) : null}
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
            <DecisionReceiptPanel receipt={activeReceipt} />
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
              originalPlan={plans.find((plan) => plan.id === activeReceipt?.selection.planId) || plans[1] || plans[0] || null}
              profile={confirmedProfile ?? profile}
              liveOpportunities={opportunities}
              usddEvidence={usddEvidence}
              decisionReceipt={activeReceipt}
              onAssumptionsEvaluated={(title, assumptions, mode) => handleReplayAssumptions(title, assumptions, mode)}
              onApplyRebalance={handleApplyRebalance}
            />
            <DecisionReceiptPanel receipt={activeReceipt} />
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
        jTrxBalance={jTrxBalance ?? "0"}
        isWalletRefreshing={isWalletRefreshing}
        networkName={walletState.network}
        initialMode={executionMode}
        profile={confirmedProfile ?? profile}
        opportunities={opportunities}
        usddEvidence={usddEvidence}
        decisionReceipt={activeReceipt}
        onDecisionReceiptUpdate={saveReceipt}
        refreshWalletState={refreshWalletState}
        refreshExecutionEvidence={refreshExecutionEvidence}
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
            <span>AI understands. Code verifies. You approve. TRON executes. The receipt remembers.</span>
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
