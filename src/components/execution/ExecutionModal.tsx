"use client";

import React, { useState, useEffect } from "react";
import { AllocationPlan, AllocationLeg } from "@/domain/allocation/types";
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
} from "@/lib/tron/transaction";
import { compassStorage } from "@/lib/persistence/storage";
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
  jTrxBalance?: string;
  networkName?: string;
  initialMode?: "SUPPLY" | "REDEEM";
  onExecutionCompleted?: (txHash: string) => void;
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
  jTrxBalance = "250.00",
  networkName = "Nile Testnet",
  initialMode = "SUPPLY",
  onExecutionCompleted,
}: ExecutionModalProps) {
  const [actionMode, setActionMode] = useState<"SUPPLY" | "REDEEM">(initialMode);
  const [supplyAmount, setSupplyAmount] = useState<string>("50");
  const [redeemAmount, setRedeemAmount] = useState<string>("100");
  const [hasAuthorized, setHasAuthorized] = useState<boolean>(false);
  const [lifecycleState, setLifecycleState] = useState<TransactionLifecycleState>("REVIEW");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isTechnicalExpanded, setIsTechnicalExpanded] = useState<boolean>(false);

  // Synchronize initialMode whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setActionMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Compute preflight dynamically based on active mode
  const preflight: PreflightResult =
    actionMode === "SUPPLY"
      ? buildPreflightChecks({
          isWalletConnected: isWalletConnected || isDemoMode,
          walletAddress: walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : ""),
          currentNetwork: isDemoMode ? "nile" : networkName,
          trxBalance: isDemoMode ? "500.00" : trxBalance,
          requiredAmount: supplyAmount,
          asset: "TRX",
        })
      : buildRedeemPreflightChecks({
          isWalletConnected: isWalletConnected || isDemoMode,
          walletAddress: walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : ""),
          currentNetwork: isDemoMode ? "nile" : networkName,
          jTrxBalance: isDemoMode ? "250.00" : jTrxBalance,
          requiredJTrxAmount: redeemAmount,
          trxBalanceForFee: isDemoMode ? "500.00" : trxBalance,
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
      setTxHash(null);
      setIsTechnicalExpanded(false);

      if (!preflight.ready) {
        setLifecycleState("PREFLIGHT_FAILED");
        const balanceCheck = preflight.checks.find(
          (c) => c.key === "BALANCE_SUFFICIENT" || c.key === "JTRX_BALANCE_SUFFICIENT"
        );
        if (balanceCheck && !balanceCheck.passed) {
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
      } else if (hasAuthorized) {
        setLifecycleState("READY_TO_SIGN");
        setStatusMessage("서명 준비 완료: [트랜잭션 승인 및 서명] 버튼을 눌러 진행해 주세요.");
      } else {
        setLifecycleState("REVIEW");
        setStatusMessage("실행 조건을 검토하신 후 동의 체크박스를 선택해 주세요.");
      }
    }
  }, [hasAuthorized, preflight.ready, lifecycleState]);

  if (!isOpen || !plan || !leg) return null;

  const handleExecute = async () => {
    if (lifecycleState !== "READY_TO_SIGN" || !hasAuthorized || !preflight.ready) {
      return;
    }

    setLifecycleState("AWAITING_WALLET_SIGNATURE");
    setStatusMessage("TronLink 지갑 서명 요청 중입니다. 팝업 창에서 서명을 승인해 주세요...");

    try {
      if (isDemoMode) {
        // Simulated Nile transaction strictly tagged as DEMO
        await new Promise((r) => setTimeout(r, 1200));
        const demoHash =
          actionMode === "SUPPLY"
            ? "7f8b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b"
            : "4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b7f8b9c1d2e3f";
        setTxHash(demoHash);
        setLifecycleState("BROADCASTING");
        setStatusMessage("Nile 테스트넷으로 트랜잭션 브로드캐스트 완료. 온체인 영수증 확인 중...");

        await new Promise((r) => setTimeout(r, 1500));
        setLifecycleState("CONFIRMING");

        await new Promise((r) => setTimeout(r, 1000));
        setLifecycleState("CONFIRMED");
        setStatusMessage(
          actionMode === "SUPPLY"
            ? "예치 트랜잭션이 온체인 블록에 최종 확정(CONFIRMED)되었습니다! (체험 모드)"
            : "인출/상환 트랜잭션이 온체인 블록에 최종 확정(CONFIRMED)되었습니다! (체험 모드)"
        );

        await compassStorage.recordExecution({
          id: `exec-demo-${Date.now()}`,
          planId: plan.id,
          walletAddress: walletAddress || "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
          txHash: demoHash,
          asset: actionMode === "SUPPLY" ? "TRX" : "jTRX",
          amount: actionMode === "SUPPLY" ? supplyAmount : redeemAmount,
          targetContract: preview.targetContract,
          network: "NILE",
          dataScope: "DEMO",
          isDemo: true,
          status: "CONFIRMED",
          timestamp: new Date().toISOString(),
        });

        if (onExecutionCompleted) onExecutionCompleted(demoHash);
      } else {
        // Real TronLink signature & broadcast on Nile
        const res =
          actionMode === "SUPPLY"
            ? await executeJTrxSupplyOnNile(preview)
            : await executeJTrxRedeemOnNile(preview);

        if (res.status === "REJECTED") {
          setLifecycleState("REJECTED");
          setStatusMessage("사용자가 지갑 서명을 취소/거부했습니다.");
          return;
        }

        setTxHash(res.txHash);
        setLifecycleState("BROADCASTING");
        setStatusMessage("Nile 테스트넷 브로드캐스트 완료. 트랜잭션 영수증 확인 중...");

        setLifecycleState("CONFIRMING");
        setStatusMessage("TronGrid 서버 검증을 통해 온체인 블록 영수증을 확인하고 있습니다...");

        const pollRes = await pollTransactionStatus(res.txHash, 10, 2500, "nile");

        if (pollRes.status === "CONFIRMED") {
          setLifecycleState("CONFIRMED");
          setStatusMessage("트랜잭션이 Nile 온체인 블록에 최종 확정(CONFIRMED)되었습니다!");

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

          if (onExecutionCompleted) onExecutionCompleted(res.txHash);
        } else if (pollRes.status === "FAILED") {
          setLifecycleState("FAILED");
          setStatusMessage(`트랜잭션 온체인 실행 실패: ${pollRes.contractResult || "자원 부족 또는 Revert"}`);
          return;
        } else {
          setLifecycleState("CONFIRMING");
          setStatusMessage(
            "트랜잭션이 브로드캐스트되었으나 아직 블록 확정 대기 중(PENDING)입니다. 아래 탐색기 링크에서 상태를 확인해 주세요."
          );
          return;
        }
      }
    } catch (err: any) {
      setLifecycleState("FAILED");
      setStatusMessage(err?.message || "트랜잭션 처리 중 오류가 발생했습니다.");
    }
  };

  const isInsufficientFunds =
    !isDemoMode &&
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
                  {isDemoMode ? "체험 모드" : "Nile Testnet"}
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
                  setActionMode("SUPPLY");
                }
              }}
              disabled={["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING", "CONFIRMED"].includes(lifecycleState)}
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
                  setActionMode("REDEEM");
                }
              }}
              disabled={["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING", "CONFIRMED"].includes(lifecycleState)}
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
                <span className="text-purple-700 font-semibold text-sm">Nile Testnet</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {actionMode === "SUPPLY" ? "현재 TRX 잔고" : "보유 jTRX 수량"}
                </span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {actionMode === "SUPPLY"
                    ? isDemoMode
                      ? "500.00 TRX"
                      : `${trxBalance} TRX`
                    : isDemoMode
                    ? "250.00 jTRX"
                    : `${jTrxBalance} jTRX`}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">예상 수수료</span>
                <span className="text-slate-600 font-mono text-sm">15 ~ 25 TRX (에너지)</span>
              </div>
            </div>

            {/* Amount Adjuster */}
            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                {actionMode === "SUPPLY" ? "예치 수량 입력:" : "상환 수량 입력:"}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING", "CONFIRMED"].includes(lifecycleState)}
                  value={actionMode === "SUPPLY" ? supplyAmount : redeemAmount}
                  onChange={(e) =>
                    actionMode === "SUPPLY"
                      ? setSupplyAmount(e.target.value)
                      : setRedeemAmount(e.target.value)
                  }
                  className="w-28 bg-white border border-slate-300 text-slate-900 font-mono font-bold text-sm rounded-xl px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-2xs"
                />
                <span className="text-xs font-bold text-slate-700">
                  {actionMode === "SUPPLY" ? "TRX" : "jTRX"}
                </span>
              </div>
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
          {lifecycleState !== "CONFIRMED" && (
            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 flex items-start gap-3">
              <input
                type="checkbox"
                id="auth-check"
                disabled={isInsufficientFunds || ["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING"].includes(lifecycleState)}
                checked={hasAuthorized}
                onChange={(e) => setHasAuthorized(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer disabled:opacity-50"
              />
              <label htmlFor="auth-check" className="text-xs text-purple-900 cursor-pointer select-none leading-relaxed font-medium">
                <strong>명시적 실행 동의: </strong>
                Nile 테스트넷 상의 {actionMode === "SUPPLY" ? `${supplyAmount} TRX 예치` : `${redeemAmount} jTRX 인출/상환`} 트랜잭션 내용을 확인하였으며, 지갑 서명을 진행하는 데 동의합니다.
              </label>
            </div>
          )}

          {/* Status Message and Transaction Hash Link */}
          {statusMessage && (
            <div
              className={`p-4 rounded-2xl text-xs flex items-start gap-3 ${
                lifecycleState === "CONFIRMED"
                  ? "bg-emerald-50 border border-emerald-300 text-emerald-900"
                  : lifecycleState === "FAILED" || lifecycleState === "REJECTED"
                  ? "bg-rose-50 border border-rose-200 text-rose-900"
                  : lifecycleState === "PREFLIGHT_FAILED"
                  ? "bg-slate-100 border border-slate-200 text-slate-700"
                  : "bg-blue-50 border border-blue-200 text-blue-900"
              }`}
            >
              {["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING"].includes(lifecycleState) ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5 text-blue-600" />
              ) : lifecycleState === "CONFIRMED" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
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

          {lifecycleState === "CONFIRMED" ? (
            <button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>확인 완료</span>
            </button>
          ) : (
            <button
              onClick={handleExecute}
              disabled={
                lifecycleState !== "READY_TO_SIGN" ||
                !hasAuthorized ||
                !preflight.ready ||
                isInsufficientFunds
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
                  <span>트랜잭션 승인 및 서명</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
