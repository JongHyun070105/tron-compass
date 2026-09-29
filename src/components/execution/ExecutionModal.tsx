"use client";

import React, { useState, useEffect, useRef } from "react";
import { AllocationPlan, AllocationLeg } from "@/domain/allocation/types";
import { NeedsProfile, YieldOpportunity } from "@/domain/allocation/types";
import { evaluateDecisionRules } from "@/domain/allocation/rules";
import { computeTotalCapitalValue } from "@/domain/allocation/engine";
import {
  buildExecutionEvidenceContext,
  executionMarketEvidenceIsFresh,
  getPreSignExecutionEvidence,
  executionRiskDirection,
  ExecutionEvidenceRefreshResult,
} from "@/domain/allocation/execution-context";
import { hasFreshMainnetValuation } from "@/domain/allocation/valuation";
import { DecisionReceipt, DecisionStopRecord, makeStopRecord, refreshDecisionReceiptIntegrity } from "@/domain/decision/receipt";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";
import { detectActiveTronNetwork, estimateNileJTrxRedeemTrx } from "@/lib/tron/network";
import { BalanceAction, refreshBalancesAfterConfirmation } from "@/lib/tron/balance-evidence";
import { WalletBalanceSnapshot, walletSnapshotsMatchReviewed } from "@/lib/tron/wallet-state";
import {
  buildPreflightChecks,
  buildRedeemPreflightChecks,
  prepareJTrxSupplyPreview,
  prepareJTrxRedeemPreview,
  executeJTrxSupplyOnNile,
  executeJTrxRedeemOnNile,
  pollTransactionStatus,
  TransactionLifecycleState,
  ExecutionPreview,
  PreflightResult,
  evaluateNileExecutionSafety,
  executeIfNileGatePasses,
} from "@/lib/tron/transaction";
import { getWalletTronWeb } from "@/lib/tron/tronlink-provider";
import { JUSTLEND_NILE_CONTRACTS } from "@/lib/integrations/justlend/contracts";
import { compassStorage } from "@/lib/persistence/storage";
import { Decimal, formatUnits, toDecimal } from "@/lib/math/decimal";
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Radio,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Lock,
  ChevronDown,
  ChevronUp,
  Droplets,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
} from "lucide-react";

interface ExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: AllocationPlan | null;
  leg: AllocationLeg | null;
  walletAddress: string;
  isWalletConnected: boolean;
  isDemoMode: boolean;
  trxBalance: string;
  jTrxBalance?: string | null;
  isWalletRefreshing?: boolean;
  networkName?: string;
  initialMode?: "SUPPLY" | "REDEEM";
  onExecutionCompleted?: (txHash: string) => void;
  refreshWalletState: (options?: { forceFresh?: boolean; clearStale?: boolean }) => Promise<WalletBalanceSnapshot | null>;
  refreshExecutionEvidence: () => Promise<ExecutionEvidenceRefreshResult>;
  profile: NeedsProfile;
  opportunities: YieldOpportunity[];
  usddEvidence: UsddProtocolEvidence | null;
  decisionReceipt: DecisionReceipt | null;
  onDecisionReceiptUpdate?: (receipt: DecisionReceipt) => Promise<void> | void;
}

export function ExecutionModal({
  isOpen,
  onClose,
  plan,
  leg,
  walletAddress,
  isWalletConnected,
  isDemoMode,
  trxBalance,
  jTrxBalance = null,
  isWalletRefreshing = false,
  networkName = "Nile Testnet",
  initialMode = "SUPPLY",
  profile,
  opportunities,
  usddEvidence,
  decisionReceipt,
  onDecisionReceiptUpdate,
  onExecutionCompleted,
  refreshWalletState,
  refreshExecutionEvidence,
}: ExecutionModalProps) {
  const [actionMode, setActionMode] = useState<"SUPPLY" | "REDEEM">(initialMode);
  const [supplyAmount, setSupplyAmount] = useState<string>("50");
  const [redeemAmount, setRedeemAmount] = useState<string>("100");
  const [hasAuthorized, setHasAuthorized] = useState<boolean>(false);
  const [approvedPreview, setApprovedPreview] = useState<ExecutionPreview | null>(null);
  const [lifecycleState, setLifecycleState] = useState<TransactionLifecycleState>("REVIEW");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isTechnicalExpanded, setIsTechnicalExpanded] = useState<boolean>(false);
  const receiptRef = useRef<DecisionReceipt | null>(decisionReceipt);
  const [exchangeRateRaw, setExchangeRateRaw] = useState<string | null>(null);
  const [balanceRefreshState, setBalanceRefreshState] = useState<"IDLE" | "FETCHING" | "READY" | "FAILED">("IDLE");
  const [isRefreshingExecutionEvidence, setIsRefreshingExecutionEvidence] = useState(false);
  const walletSnapshotRef = useRef<WalletBalanceSnapshot | null>(null);
  const liveTrxBalance = isDemoMode ? "500.00" : trxBalance;
  const liveJTrxBalance = isDemoMode ? "250.00" : jTrxBalance;
  const activeWalletNetwork = networkName;

  useEffect(() => {
    if (decisionReceipt && decisionReceipt.id !== receiptRef.current?.id) {
      receiptRef.current = decisionReceipt;
    } else if (decisionReceipt) {
      receiptRef.current = decisionReceipt;
    }
  }, [decisionReceipt]);

  // Synchronize initialMode whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setActionMode(initialMode);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen || isDemoMode) {
      if (isDemoMode) setExchangeRateRaw(null);
      setBalanceRefreshState("IDLE");
      walletSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    walletSnapshotRef.current = null;
    setExchangeRateRaw(null);
    setBalanceRefreshState("FETCHING");
    refreshWalletState({ clearStale: false }).then((snapshot) => {
      if (cancelled) return;
      if (!snapshot) {
        setBalanceRefreshState("FAILED");
        return;
      }
      setExchangeRateRaw(snapshot.exchangeRateRaw);
      const ready = snapshot.network.toLowerCase().includes("nile") &&
        snapshot.trxBalance !== null && snapshot.jTrxBalance !== null;
      setBalanceRefreshState(ready ? "READY" : "FAILED");
      walletSnapshotRef.current = ready ? snapshot : null;
    }).catch(() => {
      if (cancelled) return;
      setBalanceRefreshState("FAILED");
    });
    return () => { cancelled = true; };
  }, [isOpen, isDemoMode, walletAddress, refreshWalletState]);

  const displayedBalanceRefreshState = isWalletRefreshing ? "FETCHING" : balanceRefreshState;

  // Compute preflight dynamically based on active mode
  const preflight: PreflightResult =
    actionMode === "SUPPLY"
      ? buildPreflightChecks({
          isWalletConnected: isWalletConnected || isDemoMode,
          walletAddress: walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : ""),
          currentNetwork: isDemoMode ? "nile" : displayedBalanceRefreshState === "READY" ? activeWalletNetwork : "unknown",
          trxBalance: isDemoMode ? "500.00" : liveTrxBalance,
          requiredAmount: supplyAmount,
          asset: "TRX",
        })
      : buildRedeemPreflightChecks({
          isWalletConnected: isWalletConnected || isDemoMode,
          walletAddress: walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : ""),
          currentNetwork: isDemoMode ? "nile" : displayedBalanceRefreshState === "READY" ? activeWalletNetwork : "unknown",
          jTrxBalance: isDemoMode ? "250.00" : (displayedBalanceRefreshState === "READY" ? liveJTrxBalance ?? "UNAVAILABLE" : "UNAVAILABLE"),
          requiredJTrxAmount: redeemAmount,
          trxBalanceForFee: isDemoMode ? "500.00" : liveTrxBalance,
        });

  const preview: ExecutionPreview =
    actionMode === "SUPPLY"
      ? prepareJTrxSupplyPreview(
          supplyAmount || "50",
          walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : "T...")
        )
      : prepareJTrxRedeemPreview(
          redeemAmount || "100",
          walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : "T...")
        );

  // Reset or initialize state strictly upon opening modal or changing mode
  useEffect(() => {
    if (isOpen) {
      setHasAuthorized(false);
      setApprovedPreview(null);
      setTxHash(null);
      setIsTechnicalExpanded(false);

      if (!preflight.ready) {
        setLifecycleState("PREFLIGHT_FAILED");
        const amountCheck = preflight.checks.find(
          (check) => check.key === "AMOUNT_VALID" && !check.passed
        );
        const balanceCheck = preflight.checks.find(
          (c) => c.key === "BALANCE_SUFFICIENT" || c.key === "JTRX_BALANCE_SUFFICIENT"
        );
        if (amountCheck) {
          setStatusMessage(amountCheck.message);
        } else if (balanceCheck && !balanceCheck.passed) {
          setStatusMessage(balanceCheck.message);
        } else {
          setStatusMessage("사전 실행 조건을 충족하지 못했습니다. 지갑 연결 및 네트워크를 확인해 주세요.");
        }
      } else {
        setLifecycleState("REVIEW");
        setStatusMessage(
          actionMode === "SUPPLY"
            ? "공급 실행 조건을 검토하신 후 동의 체크박스를 선택해 주세요."
            : "인출/상환 실행 조건을 검토하신 후 동의 체크박스를 선택해 주세요."
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, plan?.id, leg?.asset, isDemoMode, trxBalance, actionMode]);

  // Update state when checkbox toggles
  useEffect(() => {
    if (["REVIEW", "PREFLIGHT_FAILED", "READY_TO_SIGN"].includes(lifecycleState)) {
      if (!preflight.ready) {
        setLifecycleState("PREFLIGHT_FAILED");
      } else if (hasAuthorized && approvedPreview) {
        setLifecycleState("READY_TO_SIGN");
        setStatusMessage("명시적 동의가 기록되었습니다. TronLink 요청은 모든 사전 실행 안전 검사를 통과한 뒤에만 열립니다.");
      } else {
        setLifecycleState("REVIEW");
        setStatusMessage("실행 조건을 검토하신 후 동의 체크박스를 선택해 주세요.");
      }
    }
  }, [hasAuthorized, approvedPreview, preflight.ready, lifecycleState]);

  if (!isOpen || !plan || !leg) return null;

  const persistReceipt = async (next: DecisionReceipt) => {
    if (!onDecisionReceiptUpdate) return;
    const current = receiptRef.current?.id === next.id ? receiptRef.current : null;
    const merged: DecisionReceipt = current ? {
      ...current,
      ...next,
      approval: {
        shown: next.approval.shown ?? current.approval.shown,
        signer: next.approval.signer ?? current.approval.signer,
        approvedAt: next.approval.approvedAt ?? current.approval.approvedAt,
      },
      execution: Object.fromEntries(Object.entries(next.execution).map(([key, value]) => [
        key,
        value === null ? (current.execution as any)[key] : value,
      ])) as DecisionReceipt["execution"],
      stops: Array.from(new Map([...current.stops, ...next.stops].map((item) => [item.id, item])).values()),
      reviews: next.reviews.length >= current.reviews.length ? next.reviews : current.reviews,
    } : next;
    const updated = await refreshDecisionReceiptIntegrity(merged);
    receiptRef.current = updated;
    await onDecisionReceiptUpdate(updated);
  };

  const handleExecute = async () => {
    if (!isDemoMode && lifecycleState === "PREFLIGHT_FAILED") {
      const failedChecks = preflight.checks.filter((check) => !check.passed);
      const stops = failedChecks.map((check) => makeStopRecord({
        timestamp: new Date().toISOString(),
        stage: "PRE_SIGN",
        ruleId: null,
        guardId: check.key,
        attemptedAction: actionMode,
        attemptedAmount: `${preview.amount} ${preview.asset}`,
        reason: check.message,
      }));
      setLifecycleState("STOPPED");
      setStatusMessage(`STOPPED · ${failedChecks.map((check) => check.message).join(" · ")}`);
      if (decisionReceipt && stops.length) {
        await persistReceipt({ ...decisionReceipt, stops: [...decisionReceipt.stops, ...stops] });
      }
      return;
    }
    if (lifecycleState !== "READY_TO_SIGN" || !hasAuthorized || !approvedPreview || !preflight.ready) return;

    const now = new Date().toISOString();
    const approvalShown = {
      amount: `${preview.amount} ${preview.asset}`,
      estimatedFee: preview.estimatedFeeTrx,
      risks: [preview.riskNotice],
      scope: preview.approvalScope,
      network: isDemoMode ? "NILE (SIMULATED)" : preview.network,
      contract: preview.targetContract,
      method: preview.method,
    };

    if (isDemoMode) {
      setLifecycleState("SIMULATED");
      setStatusMessage("SIMULATED OUTCOME: no TronLink request, transaction hash, broadcast, or chain confirmation was created.");
      if (decisionReceipt) {
        await persistReceipt({
          ...decisionReceipt,
          approval: { shown: approvalShown, signer: "DEMO SIMULATION", approvedAt: now },
          execution: {
            ...decisionReceipt.execution,
            network: "NILE (SIMULATED)",
            contract: preview.targetContract,
            method: preview.method,
            callValue: actionMode === "SUPPLY" ? preview.amountRaw : null,
            amountAsset: preview.asset,
            amount: preview.amount,
            amountRaw: preview.amountRaw,
            txHash: null,
            blockNumber: null,
            contractResult: null,
            result: "SIMULATED",
          },
        });
      }
      await compassStorage.recordExecution({
        id: `exec-demo-${Date.now()}`,
        planId: plan.id,
        walletAddress: walletAddress || "DEMO",
        txHash: "",
        asset: actionMode === "SUPPLY" ? "TRX" : "jTRX",
        amount: actionMode === "SUPPLY" ? supplyAmount : redeemAmount,
        targetContract: preview.targetContract,
        network: "NILE",
        dataScope: "DEMO",
        isDemo: true,
        status: "SIMULATED",
        timestamp: now,
      });
      return;
    }

    const frozenRules = decisionReceipt?.rules.items ?? profile.investmentRules ?? [];
    const confirmed = !!decisionReceipt?.needsConfirmedAt && frozenRules.length > 0;
    const frozenProfile: NeedsProfile = { ...profile, investmentRules: frozenRules };
    const riskDirection = executionRiskDirection(actionMode);
    let currentOpportunities = opportunities;
    let currentUsddEvidence = usddEvidence;

    if (riskDirection === "INCREASE_EXPOSURE") {
      setIsRefreshingExecutionEvidence(true);
      setStatusMessage("Refreshing authoritative JustLend and USDD Mainnet evidence before the Supply safety check…");
      try {
        const refreshed = await getPreSignExecutionEvidence(actionMode, {
          opportunities: currentOpportunities,
          usddEvidence: currentUsddEvidence,
        }, refreshExecutionEvidence);
        currentOpportunities = refreshed.opportunities;
        currentUsddEvidence = refreshed.usddEvidence;
      } catch (error) {
        const reason = error instanceof Error && error.message.includes("LIVE_VALUATION_REQUIRED_FOR_NEW_EXPOSURE")
          ? error.message
          : "LIVE_VALUATION_REQUIRED_FOR_NEW_EXPOSURE: authoritative Mainnet evidence refresh failed.";
        const stop = makeStopRecord({
          timestamp: new Date().toISOString(),
          stage: "PRE_SIGN",
          ruleId: null,
          guardId: "LIVE_VALUATION_REQUIRED_FOR_NEW_EXPOSURE",
          attemptedAction: actionMode,
          attemptedAmount: `${preview.amount} ${preview.asset}`,
          reason,
        });
        setLifecycleState("STOPPED");
        setStatusMessage(`STOPPED · ${reason}`);
        setIsRefreshingExecutionEvidence(false);
        if (decisionReceipt) await persistReceipt({
          ...decisionReceipt,
          approval: { shown: approvalShown, signer: walletAddress || null, approvedAt: now },
          stops: [...decisionReceipt.stops, stop],
        });
        return;
      }
      setIsRefreshingExecutionEvidence(false);
    }

    let candidateAllocations = [...plan.allocations];
    let resizedAmountHasUsdtEquivalentValue = actionMode !== "SUPPLY";
    if (actionMode === "SUPPLY") {
      try {
        const legUnits = new Decimal(leg.amount);
        const legValue = new Decimal(leg.valueUsdtEquivalent);
        const resizedUnits = new Decimal(supplyAmount);
        resizedAmountHasUsdtEquivalentValue = legUnits.isFinite() && legUnits.gt(0) &&
          legValue.isFinite() && legValue.gt(0) && resizedUnits.isFinite() && resizedUnits.gt(0);
        if (resizedAmountHasUsdtEquivalentValue) {
          const amountUsdtEquivalent = resizedUnits.times(legValue).div(legUnits).toFixed(2);
          const replacement = { ...leg, asset: "TRX", amount: supplyAmount, valueUsdtEquivalent: amountUsdtEquivalent };
          const selectedIndex = candidateAllocations.findIndex((item) => item.productId === leg.productId);
          if (selectedIndex >= 0) candidateAllocations[selectedIndex] = replacement;
          else candidateAllocations.push(replacement);
        }
      } catch {
        resizedAmountHasUsdtEquivalentValue = false;
      }
    }
    const evidenceContext = buildExecutionEvidenceContext({
      plan,
      profile: frozenProfile,
      opportunities: currentOpportunities,
      usddEvidence: currentUsddEvidence,
      now: Date.now(),
    });
    const executionProfile = evidenceContext.profile;
    const ruleResult = actionMode === "REDEEM"
      ? { passed: confirmed, checks: [] }
      : confirmed && resizedAmountHasUsdtEquivalentValue
        ? evaluateDecisionRules(executionProfile, computeTotalCapitalValue(executionProfile), candidateAllocations, currentOpportunities)
        : { passed: false, checks: [] };
    const failedRule = ruleResult.checks.find((item) => !item.passed);
    const rawRequired = failedRule?.required.replace(/^[<>]=?\s*/, "") ?? "confirmed My Rules";
    const finalRuleViolation = !confirmed
      ? { ruleId: "RULES_UNCONFIRMED", actual: "unconfirmed", required: "confirmed My Rules" }
      : failedRule
        ? { ruleId: failedRule.ruleId ?? failedRule.key, actual: failedRule.actual, required: rawRequired, reason: failedRule.detail }
        : !resizedAmountHasUsdtEquivalentValue
          ? { ruleId: "VALUATION_UNAVAILABLE", actual: "UNKNOWN", required: "source-backed USDT-equivalent valuation" }
          : undefined;
    const requiredMarketEvidence = evidenceContext.marketEvidence;
    const valuationEvidence = evidenceContext.valuationEvidence;
    const rulesPassed = confirmed && (actionMode === "REDEEM" || ruleResult.passed);

    const tronWeb = getWalletTronWeb();
    const activeNetwork = detectActiveTronNetwork(tronWeb).name;
    const gate = evaluateNileExecutionSafety({
      network: activeNetwork || networkName,
      leg,
      preview,
      approvedPreview,
      approvalShown: hasAuthorized && !!approvedPreview,
      evidence: requiredMarketEvidence,
      valuationEvidence,
      rulesPassed,
      ruleViolation: finalRuleViolation,
      now: Date.now(),
    });

    if (decisionReceipt) {
      await persistReceipt({
        ...decisionReceipt,
        approval: { shown: approvalShown, signer: walletAddress || null, approvedAt: now },
      });
    }

    if (!gate.ready) {
      setLifecycleState("STOPPED");
      setStatusMessage(`STOPPED · ${gate.stops[0]?.reason ?? "Nile execution guard failed."}`);
      if (decisionReceipt) {
        const stops: DecisionStopRecord[] = [...decisionReceipt.stops, ...gate.stops];
        await persistReceipt({
          ...decisionReceipt,
          approval: { shown: approvalShown, signer: walletAddress || null, approvedAt: now },
          stops,
        });
      }
      return;
    }

    try {
      const finalGate = evaluateNileExecutionSafety({
        network: detectActiveTronNetwork(getWalletTronWeb()).name || networkName,
        leg,
        preview,
        approvedPreview,
        approvalShown: hasAuthorized && !!approvedPreview,
        evidence: requiredMarketEvidence,
        valuationEvidence,
        rulesPassed,
        ruleViolation: finalRuleViolation,
        now: Date.now(),
      });
      if (!finalGate.ready) {
        setLifecycleState("STOPPED");
        setStatusMessage(`STOPPED · ${finalGate.stops[0]?.reason ?? "Nile execution guard failed."}`);
        if (decisionReceipt) await persistReceipt({ ...decisionReceipt, stops: [...decisionReceipt.stops, ...finalGate.stops] });
        return;
      }
      const reviewedBalances = walletSnapshotRef.current;
      setBalanceRefreshState("FETCHING");
      const balancesBefore = await refreshWalletState({ forceFresh: true, clearStale: false });
      const balanceReadReady = !!balancesBefore && balancesBefore.network.toLowerCase().includes("nile") &&
        balancesBefore.trxBalance !== null && balancesBefore.jTrxBalance !== null;
      const balancesMatchReviewed = balanceReadReady &&
        walletSnapshotsMatchReviewed(reviewedBalances, balancesBefore, actionMode);
      setBalanceRefreshState(balanceReadReady ? "READY" : "FAILED");
      if (!balanceReadReady || !balancesMatchReviewed) {
        if (balanceReadReady && balancesBefore) {
          walletSnapshotRef.current = balancesBefore;
          setExchangeRateRaw(balancesBefore.exchangeRateRaw);
        }
        const reason = !balanceReadReady
          ? "Live Nile balances unavailable — execution paused."
          : "Wallet balances or the jTRX exchange rate changed after review. Review the refreshed Nile values before signing.";
        const stop = makeStopRecord({
          timestamp: new Date().toISOString(),
          stage: "PRE_SIGN",
          ruleId: null,
          guardId: !balanceReadReady ? "NILE_BALANCE_UNAVAILABLE" : "NILE_BALANCE_CHANGED",
          attemptedAction: actionMode,
          attemptedAmount: `${preview.amount} ${preview.asset}`,
          reason,
        });
        setLifecycleState("STOPPED");
        setStatusMessage(`STOPPED · ${reason}`);
        if (decisionReceipt) await persistReceipt({ ...decisionReceipt, stops: [...decisionReceipt.stops, stop] });
        return;
      }
      if (decisionReceipt) await persistReceipt({
        ...decisionReceipt,
        approval: { shown: approvalShown, signer: walletAddress || null, approvedAt: now },
        execution: {
          ...decisionReceipt.execution,
          network: "NILE",
          contract: preview.targetContract,
          method: preview.method,
          callValue: actionMode === "SUPPLY" ? preview.amountRaw : null,
          amountAsset: preview.asset,
          amount: preview.amount,
          amountRaw: preview.amountRaw,
          balanceAction: actionMode,
          balanceEvidenceStatus: "PENDING",
          result: "AWAITING_SIGNATURE",
        },
      });
      setLifecycleState("AWAITING_WALLET_SIGNATURE");
      setStatusMessage("TronLink 서명 대기 중입니다. 승인 전 실제 수량과 컨트랙트를 지갑 창에서도 확인해 주세요.");
      const guarded = await executeIfNileGatePasses(finalGate, () =>
        actionMode === "SUPPLY"
          ? executeJTrxSupplyOnNile(preview, tronWeb)
          : executeJTrxRedeemOnNile(preview, tronWeb)
      );
      if (!guarded.ready || !guarded.result) {
        setLifecycleState("STOPPED");
        setStatusMessage(`STOPPED · ${guarded.stops[0]?.reason ?? "Nile execution guard failed."}`);
        if (decisionReceipt) await persistReceipt({ ...decisionReceipt, stops: [...decisionReceipt.stops, ...guarded.stops] });
        return;
      }
      const res = guarded.result;
      if (res.status === "REJECTED") {
        setLifecycleState("REJECTED");
        setStatusMessage("TronLink user rejected the request. No confirmed transaction was recorded.");
        if (decisionReceipt) await persistReceipt({
          ...decisionReceipt,
          execution: {
            ...decisionReceipt.execution,
            network: null,
            contract: null,
            method: null,
            callValue: null,
            amountAsset: null,
            amount: null,
            amountRaw: null,
            txHash: null,
            blockNumber: null,
            contractResult: null,
            result: "PREPARED",
            balanceAction: null,
            balanceEvidenceStatus: undefined,
          },
        });
        return;
      }

      setTxHash(res.txHash);
      setLifecycleState("BROADCASTING");
      setStatusMessage("Nile transaction broadcast. Waiting for independent TronGrid verification.");
      if (decisionReceipt) await persistReceipt({
        ...decisionReceipt,
        execution: {
          ...decisionReceipt.execution,
          network: "NILE",
          contract: preview.targetContract,
          method: preview.method,
          callValue: actionMode === "SUPPLY" ? preview.amountRaw : null,
          amountAsset: preview.asset,
          amount: preview.amount,
          amountRaw: preview.amountRaw,
          txHash: res.txHash,
          result: "BROADCAST",
        },
      });

      setLifecycleState("CONFIRMING");
      setStatusMessage("TronGrid is checking block inclusion and execution result.");
      if (decisionReceipt) await persistReceipt({
        ...decisionReceipt,
        execution: { ...decisionReceipt.execution, txHash: res.txHash, result: "PENDING" },
      });
      const pollRes = await pollTransactionStatus(res.txHash, 10, 2500, "nile");

      if (pollRes.status === "CONFIRMED") {
        setLifecycleState("CONFIRMED");
        setStatusMessage("TronGrid confirmed the transaction. BALANCE REFRESH PENDING · fetching fresh chain balances.");
        const postTransactionEvidence = balancesBefore
          ? await refreshBalancesAfterConfirmation(
              actionMode as BalanceAction,
              balancesBefore,
              () => refreshWalletState({ forceFresh: true, clearStale: true })
            )
          : { after: null, evidence: { status: "UNAVAILABLE" as const, trxDelta: null, jTrxDelta: null } };
        const balancesAfter = postTransactionEvidence.after;
        if (postTransactionEvidence.evidence.status === "VERIFIED") {
          setStatusMessage("TronGrid confirmed the transaction and fresh TRX/jTRX balance directions were verified.");
          setBalanceRefreshState("READY");
        } else if (postTransactionEvidence.evidence.status === "STALE") {
          setStatusMessage("TronGrid confirmed the transaction, but BALANCE EVIDENCE is STALE after bounded fresh reads.");
          setBalanceRefreshState("FAILED");
        } else {
          setStatusMessage("TronGrid confirmed the transaction, but BALANCE EVIDENCE is UNAVAILABLE after bounded fresh reads.");
          setBalanceRefreshState("FAILED");
        }
        const actualFee = pollRes.feeSun === undefined
          ? null
          : `${formatUnits(String(pollRes.feeSun), 6)} TRX`;
        if (decisionReceipt) await persistReceipt({
          ...decisionReceipt,
          execution: {
            ...decisionReceipt.execution,
            network: "NILE",
            contract: preview.targetContract,
            method: preview.method,
            callValue: actionMode === "SUPPLY" ? preview.amountRaw : null,
            txHash: res.txHash,
            blockNumber: pollRes.blockNumber ?? null,
            contractResult: pollRes.contractResult ?? null,
            result: "CONFIRMED",
            energyUsed: pollRes.energyUsed ?? null,
            netUsed: pollRes.netUsed ?? null,
            actualFee,
            balanceAction: actionMode,
            balanceEvidenceStatus: postTransactionEvidence.evidence.status,
            balanceBefore: actionMode === "SUPPLY" ? balancesBefore?.trxBalance ?? null : balancesBefore?.jTrxBalance ?? null,
            balanceAfter: actionMode === "SUPPLY" ? balancesAfter?.trxBalance ?? null : balancesAfter?.jTrxBalance ?? null,
            trxBalanceBefore: balancesBefore?.trxBalance ?? null,
            trxBalanceAfter: balancesAfter?.trxBalance ?? null,
            jTrxBalanceBefore: balancesBefore?.jTrxBalance ?? null,
            jTrxBalanceAfter: balancesAfter?.jTrxBalance ?? null,
            trxBalanceDelta: postTransactionEvidence.evidence.trxDelta,
            jTrxBalanceDelta: postTransactionEvidence.evidence.jTrxDelta,
            balanceReality: balancesBefore?.trxBalance != null && balancesBefore?.jTrxBalance != null &&
              balancesAfter?.trxBalance != null && balancesAfter?.jTrxBalance != null ? "NILE_LIVE" : null,
          },
        });
        await compassStorage.recordExecution({
          id: `exec-nile-${Date.now()}`,
          planId: plan.id,
          walletAddress,
          txHash: res.txHash,
          asset: actionMode === "SUPPLY" ? "TRX" : "jTRX",
          amount: actionMode === "SUPPLY" ? supplyAmount : redeemAmount,
          targetContract: preview.targetContract,
          network: "NILE",
          dataScope: "LIVE_NILE",
          isDemo: false,
          status: "CONFIRMED",
          timestamp: new Date().toISOString(),
        });
        onExecutionCompleted?.(res.txHash);
      } else if (pollRes.status === "FAILED") {
        setLifecycleState("FAILED");
        setStatusMessage(`TronGrid verified transaction failure: ${pollRes.contractResult || "contract execution failed"}`);
        if (decisionReceipt) await persistReceipt({ ...decisionReceipt, execution: { ...decisionReceipt.execution, txHash: res.txHash, result: "FAILED" } });
      } else {
        setLifecycleState("CONFIRMING");
        setStatusMessage("BROADCAST / PENDING · TronGrid has not confirmed the transaction yet.");
        if (decisionReceipt) await persistReceipt({ ...decisionReceipt, execution: { ...decisionReceipt.execution, txHash: res.txHash, result: "PENDING" } });
      }
    } catch (err: any) {
      setLifecycleState("FAILED");
      setStatusMessage(err?.message || "Transaction processing failed.");
      if (decisionReceipt) await persistReceipt({ ...decisionReceipt, execution: { ...decisionReceipt.execution, result: "FAILED" } });
    }
  };

  const isInsufficientFunds =
    !isDemoMode &&
    preflight.checks.every((check) => check.key !== "AMOUNT_VALID" || check.passed) &&
    preflight.checks.some(
      (c) =>
        (c.key === "BALANCE_SUFFICIENT" || c.key === "JTRX_BALANCE_SUFFICIENT") &&
        !c.passed
    );

  // Stepper status
  const getStepStatus = () => {
    switch (lifecycleState) {
      case "REVIEW":
      case "PREFLIGHT_FAILED":
        return 1;
      case "READY_TO_SIGN":
        return 1;
      case "AWAITING_WALLET_SIGNATURE":
        return 2;
      case "BROADCASTING":
        return 3;
      case "CONFIRMING":
        return 3;
      case "CONFIRMED":
        return 4;
      default:
        return 1;
    }
  };

  const currentStepNum = getStepStatus();
  const previewEvidenceContext = buildExecutionEvidenceContext({
    plan,
    profile,
    opportunities,
    usddEvidence,
  });
  const marketContextFresh = executionMarketEvidenceIsFresh(previewEvidenceContext.marketEvidence) &&
    hasFreshMainnetValuation(previewEvidenceContext.profile, Date.now());
  const hasConfirmedRules = !!decisionReceipt?.needsConfirmedAt &&
    (decisionReceipt.rules.items.length > 0 || (profile.investmentRules?.length ?? 0) > 0);
  const redeemExecutionSafetyPass = actionMode === "REDEEM" && !isDemoMode && preflight.ready &&
    leg.executabilityClass === "NILE_EXECUTABLE" && leg.executionNetwork === "NILE" &&
    preview.targetContract === JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58 &&
    preview.method === "redeem(uint256)" && hasConfirmedRules && hasAuthorized &&
    approvedPreview?.amountRaw === preview.amountRaw && approvedPreview?.amount === preview.amount;
  const estimatedRedeemTrx = actionMode === "REDEEM" && exchangeRateRaw
    ? estimateNileJTrxRedeemTrx(redeemAmount, exchangeRateRaw)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Nile 실행 검토 및 서명
                </h3>
                <span className="text-[11px] bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded-full">
                  {isDemoMode ? "SIMULATED · 체험 모드" : "Nile Testnet"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                지갑에서 직접 서명하기 전까지 자산이 이동되지 않습니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher: Supply vs Redeem */}
        <div className="px-6 pt-3 bg-slate-50">
          <div className="grid grid-cols-2 gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => {
                if (lifecycleState === "REVIEW" || lifecycleState === "PREFLIGHT_FAILED" || lifecycleState === "READY_TO_SIGN") {
                  setHasAuthorized(false);
                  setApprovedPreview(null);
                  setActionMode("SUPPLY");
                }
              }}
              disabled={isRefreshingExecutionEvidence || ["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING", "CONFIRMED", "SIMULATED"].includes(lifecycleState)}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                actionMode === "SUPPLY"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-purple-600" />
              <span>JustLend 공급 (Supply)</span>
            </button>

            <button
              onClick={() => {
                if (lifecycleState === "REVIEW" || lifecycleState === "PREFLIGHT_FAILED" || lifecycleState === "READY_TO_SIGN") {
                  setHasAuthorized(false);
                  setApprovedPreview(null);
                  setActionMode("REDEEM");
                }
              }}
              disabled={isRefreshingExecutionEvidence || ["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING", "CONFIRMED", "SIMULATED"].includes(lifecycleState)}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                actionMode === "REDEEM"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
              <span>인출 / 상환 (Redeem)</span>
            </button>
          </div>
        </div>

        {/* Visual Progress Stepper */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200/80">
          <div className="flex items-center justify-between text-xs font-semibold">
            <div className={`flex items-center gap-1.5 ${currentStepNum >= 1 ? "text-slate-900" : "text-slate-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStepNum >= 1 ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"}`}>
                {currentStepNum > 1 ? <Check className="w-3 h-3 stroke-[3]" /> : "1"}
              </span>
              <span>조건 검토</span>
            </div>
            <div className="w-8 h-0.5 bg-slate-200"></div>

            <div className={`flex items-center gap-1.5 ${currentStepNum >= 2 ? "text-slate-900" : "text-slate-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStepNum >= 2 ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"}`}>
                {currentStepNum > 2 ? <Check className="w-3 h-3 stroke-[3]" /> : "2"}
              </span>
              <span>지갑 서명</span>
            </div>
            <div className="w-8 h-0.5 bg-slate-200"></div>

            <div className={`flex items-center gap-1.5 ${currentStepNum >= 3 ? "text-slate-900" : "text-slate-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStepNum >= 3 ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"}`}>
                {currentStepNum > 3 ? <Check className="w-3 h-3 stroke-[3]" /> : "3"}
              </span>
              <span>블록 전송</span>
            </div>
            <div className="w-8 h-0.5 bg-slate-200"></div>

            <div className={`flex items-center gap-1.5 ${currentStepNum >= 4 ? "text-emerald-700" : "text-slate-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStepNum >= 4 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                4
              </span>
              <span>최종 확정</span>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {actionMode === "REDEEM" && !isDemoMode && (
            <section aria-label="Redeem safety status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between gap-2"><strong className="text-slate-800">MARKET CONTEXT</strong><span className="font-bold text-amber-800">{marketContextFresh ? "CURRENT" : "STALE / UNAVAILABLE"}</span></div>
              <p className="text-slate-600">Reality: NILE LIVE execution.</p>
              <p className="text-slate-600">DECISION SNAPSHOT AT {decisionReceipt?.createdAt ? new Date(decisionReceipt.createdAt).toLocaleTimeString() : "unavailable"} · LIVE EVIDENCE FETCHED AT {previewEvidenceContext.liveEvidenceFetchedAt ? new Date(previewEvidenceContext.liveEvidenceFetchedAt).toLocaleTimeString() : "unavailable"} · WALLET STATE FETCHED AT {walletSnapshotRef.current?.fetchedAt ? new Date(walletSnapshotRef.current.fetchedAt).toLocaleTimeString() : "unavailable"}.</p>
              {!marketContextFresh && <p className="text-amber-900">{redeemExecutionSafetyPass
                ? "Current market valuation is unavailable. This exit reduces the existing Nile test position and can still be submitted after your approval."
                : "Current market valuation is unavailable. Stale market pricing alone does not block an exit; complete the required safety checks before requesting wallet approval."}</p>}
              {!hasConfirmedRules && <p className="text-amber-900">My Rules are not confirmed. Confirm the displayed rules before opening the wallet request.</p>}
              <div className="flex items-center justify-between gap-2 border-t border-amber-200 pt-1.5"><strong className="text-slate-800">EXECUTION SAFETY</strong><span className={`font-bold ${redeemExecutionSafetyPass ? "text-emerald-700" : "text-slate-600"}`}>{redeemExecutionSafetyPass ? "PASS" : "REVIEW REQUIRED"}</span></div>
            </section>
          )}
          {/* Action Overview Box */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200/90 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <span className="text-xs font-semibold text-slate-500">실행 대상 작업</span>
              <span className="text-xs font-bold text-slate-900 font-mono bg-white border border-slate-200 px-3 py-1 rounded-lg shadow-2xs">
                {actionMode === "SUPPLY"
                  ? `JustLend Supply (${supplyAmount} TRX)`
                  : `JustLend Redeem (${redeemAmount} jTRX)`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">프로토콜</span>
                <span className="text-slate-900 font-bold text-sm">JustLend DAO</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">네트워크</span>
                  <span className="text-purple-700 font-semibold text-sm">{isDemoMode ? "Nile Testnet · SIMULATED" : displayedBalanceRefreshState === "READY" ? activeWalletNetwork : displayedBalanceRefreshState === "FETCHING" ? "Refreshing connected network…" : activeWalletNetwork}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {actionMode === "SUPPLY" ? "현재 TRX 잔고" : "보유 jTRX 수량"}
                </span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {actionMode === "SUPPLY"
                    ? isDemoMode
                      ? "SIMULATED · 500.00 TRX"
                      : displayedBalanceRefreshState === "FETCHING" ? "Refreshing Nile balance…" : `${liveTrxBalance} TRX`
                    : isDemoMode
                    ? "SIMULATED · 250.00 jTRX"
                  : displayedBalanceRefreshState === "FETCHING" ? "Refreshing Nile balance…" : liveJTrxBalance === null ? "UNAVAILABLE" : `${liveJTrxBalance} jTRX`}
                </span>
              </div>
              {actionMode === "REDEEM" && (
                <div>
                  <span className="text-slate-400 block text-[11px]">TRX 잔고 · 수수료 버퍼</span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    {isDemoMode ? "SIMULATED · 500.00 TRX" : displayedBalanceRefreshState === "FETCHING" ? "Refreshing Nile balance…" : `${liveTrxBalance} TRX`}
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-400 block text-[11px]">수수료 안내</span>
                <span className="text-slate-600 text-[11px]">{preview.estimatedFeeTrx} · actual fee unavailable</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">연결 지갑</span>
                <span className="font-mono font-semibold text-xs text-slate-800 break-all">{isDemoMode ? "SIMULATED wallet" : isWalletConnected ? walletAddress : "Not connected"}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-[11px]">
              <div className="flex justify-between gap-3"><span className="text-slate-500">요청 수량 / 단위</span><strong className="text-right font-mono text-slate-900">{preview.amount} {preview.asset} · {preview.amountRaw} base units</strong></div>
              {actionMode === "REDEEM" && <div className="flex justify-between gap-3"><span className="text-slate-500">예상 반환량</span><strong className="text-right text-slate-900">{estimatedRedeemTrx === null ? "Unavailable" : `≈ ${estimatedRedeemTrx} TRX`}</strong></div>}
              {actionMode === "REDEEM" && <p className="text-[10px] leading-relaxed text-slate-500">{estimatedRedeemTrx === null ? "Nile exchangeRateStored is unavailable; no return estimate is shown." : "Approximation from the current Nile jTRX exchangeRateStored. The contract result may differ; this is not a guaranteed return."}</p>}
              {actionMode === "REDEEM" && <div className="flex justify-between gap-3"><span className="text-slate-500">Expected result</span><strong className="text-right text-slate-900">jTRX decreases; TRX increases. Net TRX delta may include network fees.</strong></div>}
              <div className="flex justify-between gap-3"><span className="text-slate-500">Contract</span><code className="text-right text-[10px] text-slate-800 break-all">{preview.targetContract}</code></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Method</span><code className="text-right text-slate-800">{preview.method}</code></div>
              <div><span className="text-slate-500">Risk</span><p className="mt-0.5 text-slate-800">{preview.riskNotice}</p></div>
              <div><span className="text-slate-500">Approval scope</span><p className="mt-0.5 text-slate-800">{preview.approvalScope}</p></div>
              {!isDemoMode && displayedBalanceRefreshState === "FETCHING" && <p className="text-amber-700">Refreshing live Nile TRX and jTRX balances before review…</p>}
              {!isDemoMode && displayedBalanceRefreshState === "FAILED" && <p className="text-rose-700">Live Nile balances are unavailable. Signing is paused.</p>}
            </div>

            {/* Amount Adjuster */}
            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                {actionMode === "SUPPLY" ? "예치 수량 입력:" : "상환 수량 입력:"}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={isRefreshingExecutionEvidence || ["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING", "CONFIRMED", "SIMULATED"].includes(lifecycleState)}
                  value={actionMode === "SUPPLY" ? supplyAmount : redeemAmount}
                  onChange={(e) => {
                    setHasAuthorized(false);
                    setApprovedPreview(null);
                    setLifecycleState("REVIEW");
                    actionMode === "SUPPLY" ? setSupplyAmount(e.target.value) : setRedeemAmount(e.target.value);
                  }}
                  className="w-28 bg-white border border-slate-300 text-slate-900 font-mono font-bold text-sm rounded-xl px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-2xs"
                />
                <span className="text-xs font-bold text-slate-700">
                  {actionMode === "SUPPLY" ? "TRX" : "jTRX"}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-white p-3 text-[11px]">
              <div className="mb-2 font-bold text-slate-800">Approval sheet · review before wallet request</div>
              <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1.5">
                <dt className="text-slate-500">Amount</dt><dd className="font-semibold text-slate-900">{preview.amount} {preview.asset}</dd>
                <dt className="text-slate-500">Wallet</dt><dd className="break-all font-mono text-slate-800">{isDemoMode ? "SIMULATED wallet" : isWalletConnected ? walletAddress : "Not connected"}</dd>
                <dt className="text-slate-500">Target network</dt><dd className="font-semibold text-slate-900">Nile Testnet · current: {isDemoMode ? "SIMULATED" : activeWalletNetwork}</dd>
                {actionMode === "REDEEM" && <><dt className="text-slate-500">jTRX balance</dt><dd className="font-mono text-slate-800">{isDemoMode ? "250.00 jTRX · SIMULATED" : liveJTrxBalance === null ? "UNAVAILABLE" : `${liveJTrxBalance} jTRX`}</dd><dt className="text-slate-500">TRX fee balance</dt><dd className="font-mono text-slate-800">{isDemoMode ? "500.00 TRX · SIMULATED" : `${liveTrxBalance} TRX`}</dd></>}
                <dt className="text-slate-500">Raw units</dt><dd className="font-mono text-slate-800">{preview.amountRaw} base units</dd>
                {actionMode === "REDEEM" && <><dt className="text-slate-500">TRX estimate</dt><dd className="text-slate-800">{estimatedRedeemTrx === null ? "Unavailable" : `≈ ${estimatedRedeemTrx} TRX; variable exchange rate`}</dd><dt className="text-slate-500">Expected result</dt><dd className="text-slate-800">jTRX decreases; TRX increases. Net TRX delta may include network fees.</dd></>}
                <dt className="text-slate-500">Contract</dt><dd className="break-all font-mono text-slate-800">{preview.targetContract}</dd>
                <dt className="text-slate-500">Method</dt><dd className="font-mono text-slate-800">{preview.method}</dd>
                <dt className="text-slate-500">Approval scope</dt><dd className="text-slate-700">{preview.approvalScope}</dd>
                <dt className="text-slate-500">Risk</dt><dd className="text-slate-700">{preview.riskNotice}</dd>
              </dl>
              <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-amber-800">Fee buffer and fee estimate are Compass policy values; actual transaction fee is not known before chain verification.</p>
            </div>
          </div>

          {/* Insufficient Balance Alert */}
          {isInsufficientFunds && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="text-amber-900 font-bold block text-sm">
                    {actionMode === "SUPPLY" ? "Nile TRX 잔고가 부족합니다" : "상환할 jTRX 포지션이 부족합니다"}
                  </strong>
                  <p className="text-amber-800 text-xs mt-1 leading-relaxed">
                    {actionMode === "SUPPLY"
                      ? `지갑 잔고(${preflight.currentBalanceTrx} TRX)가 부족합니다. 예치금 및 수수료 버퍼를 위해 총 ${preflight.requiredTotalTrx} TRX가 필요합니다.`
                      : `상환을 진행하려면 먼저 JustLend에 TRX를 예치(Supply)하여 jTRX 토큰을 보유하고 있어야 합니다.`}
                  </p>
                </div>
              </div>

              {actionMode === "SUPPLY" && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-amber-700">
                    Nile 공식 Faucet에서 무료 테스트 TRX를 받아보세요.
                  </span>
                  <a
                    href="https://nileex.io/join/getJoinPage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-2xs transition-colors"
                  >
                    <Droplets className="w-3.5 h-3.5" />
                    <span>무료 TRX 받기</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Technical Details Accordion */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
            <button
              onClick={() => setIsTechnicalExpanded(!isTechnicalExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <span>기술 세부 정보 (컨트랙트 및 메서드)</span>
              </span>
              {isTechnicalExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {isTechnicalExpanded && (
              <div className="p-4 space-y-2 border-t border-slate-200/80 bg-white">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400 text-[11px]">대상 컨트랙트 (Nile jTRX)</span>
                  <span className="text-purple-700 font-mono text-[11px] font-medium select-all">
                    {preview.targetContract}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400 text-[11px]">호출 메서드</span>
                  <span className="text-emerald-700 font-mono text-[11px] font-semibold">{preview.method}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400 text-[11px]">전송 파라미터</span>
                  <span className="text-slate-700 font-mono text-[11px]">{preview.amountRaw}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400 text-[11px]">수수료 한도 (FeeLimit)</span>
                  <span className="text-slate-700 font-mono text-[11px]">100,000,000 sun (100 TRX)</span>
                </div>
              </div>
            )}
          </div>

          {/* User Confirmation Checkbox */}
          {!(["CONFIRMED", "SIMULATED"].includes(lifecycleState)) && (
            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 flex items-start gap-3">
              <input
                type="checkbox"
                id="auth-check"
                disabled={isInsufficientFunds || ["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING"].includes(lifecycleState)}
                checked={hasAuthorized}
                onChange={(e) => {
                  setHasAuthorized(e.target.checked);
                  setApprovedPreview(e.target.checked ? preview : null);
                  setLifecycleState("REVIEW");
                }}
                className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer disabled:opacity-50"
              />
              <label htmlFor="auth-check" className="text-xs text-purple-900 cursor-pointer select-none leading-relaxed font-medium">
                <strong>{isDemoMode ? "시뮬레이션 확인: " : "명시적 실행 동의: "}</strong>
                {isDemoMode
                  ? `SIMULATED ONLY: ${preview.amount} ${preview.asset}. No wallet request or chain action will occur.`
                  : `I reviewed ${preview.amount} ${preview.asset}, wallet, network, balances, contract, method, fee estimate, risks, scope and expected result. Request the TronLink signature.`}
              </label>
            </div>
          )}

          {/* Status Message and Transaction Hash Link */}
          {statusMessage && (
            <div
              className={`p-4 rounded-2xl text-xs flex items-start gap-3 ${
                lifecycleState === "CONFIRMED"
                  ? "bg-emerald-50 border border-emerald-300 text-emerald-900"
                  : lifecycleState === "FAILED" || lifecycleState === "REJECTED" || lifecycleState === "STOPPED"
                  ? "bg-rose-50 border border-rose-200 text-rose-900"
                  : lifecycleState === "SIMULATED"
                  ? "bg-amber-50 border border-amber-200 text-amber-900"
                  : lifecycleState === "PREFLIGHT_FAILED"
                  ? "bg-slate-100 border border-slate-200 text-slate-700"
                  : "bg-blue-50 border border-blue-200 text-blue-900"
              }`}
            >
              {["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING"].includes(lifecycleState) ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5 text-blue-600" />
              ) : lifecycleState === "CONFIRMED" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : lifecycleState === "SIMULATED" ? (
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : lifecycleState === "PREFLIGHT_FAILED" || isInsufficientFunds ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              )}

              <div className="flex-1">
                <div className="font-semibold">{statusMessage}</div>
                {txHash && (
                  <div className="mt-2 pt-2 border-t border-emerald-200 flex items-center justify-between flex-wrap gap-2">
                    <span className="font-mono text-[11px] text-slate-600 truncate max-w-xs">
                      TX: {txHash}
                    </span>
                    <a
                      href={`https://nile.tronscan.org/#/transaction/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-bold underline text-xs"
                    >
                      <span>Nile TronScan 영수증 확인</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-900 font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            {lifecycleState === "CONFIRMED" ? "닫기" : "취소"}
          </button>

          {lifecycleState === "PREFLIGHT_FAILED" && !isDemoMode ? (
            <button
              onClick={handleExecute}
              className="bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Record safety stop</span>
            </button>
          ) : lifecycleState === "CONFIRMED" || lifecycleState === "SIMULATED" ? (
            <button
              onClick={onClose}
              className={`${lifecycleState === "CONFIRMED" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"} text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer`}
            >
              {lifecycleState === "CONFIRMED" ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
              <span>{lifecycleState === "CONFIRMED" ? "TronGrid confirmed" : "Close simulation"}</span>
            </button>
          ) : lifecycleState === "REJECTED" ? (
            <button
              onClick={() => {
                setHasAuthorized(false);
                setApprovedPreview(null);
                setLifecycleState("REVIEW");
                setStatusMessage("Request rejected in TronLink. Review the parameters and consent again before retrying.");
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Review and retry</span>
            </button>
          ) : (
            <button
              onClick={handleExecute}
              disabled={
                lifecycleState !== "READY_TO_SIGN" ||
                !hasAuthorized ||
                !preflight.ready ||
                isRefreshingExecutionEvidence ||
                isInsufficientFunds ||
                (actionMode === "REDEEM" && !isDemoMode && !redeemExecutionSafetyPass)
              }
              className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              {["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING"].includes(lifecycleState) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {lifecycleState === "AWAITING_WALLET_SIGNATURE"
                      ? "지갑 서명 대기 중..."
                      : "온체인 처리 중..."}
                  </span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{isDemoMode ? "Record simulation" : "Request TronLink signature"}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
