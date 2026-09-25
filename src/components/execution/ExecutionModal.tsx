"use client";

import React, { useState, useEffect } from "react";
import { AllocationPlan, AllocationLeg } from "@/domain/allocation/types";
import {
  buildPreflightChecks,
  prepareJTrxSupplyPreview,
  executeJTrxSupplyOnNile,
  pollTransactionStatus,
  determineTransactionState,
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
  Coins,
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
  networkName?: string;
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
  networkName = "Nile Testnet",
  onExecutionCompleted,
}: ExecutionModalProps) {
  const [depositAmount, setDepositAmount] = useState<string>("50");
  const [hasAuthorized, setHasAuthorized] = useState<boolean>(false);
  const [lifecycleState, setLifecycleState] = useState<TransactionLifecycleState>("REVIEW");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isTechnicalExpanded, setIsTechnicalExpanded] = useState<boolean>(false);

  // Compute preflight whenever dependencies change
  const preflight: PreflightResult = buildPreflightChecks({
    isWalletConnected: isWalletConnected || isDemoMode,
    walletAddress: walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : ""),
    currentNetwork: isDemoMode ? "nile" : networkName,
    trxBalance: isDemoMode ? "500.00" : trxBalance,
    requiredAmount: depositAmount,
    asset: "TRX",
  });

  const preview: ExecutionPreview = prepareJTrxSupplyPreview(
    depositAmount || "50",
    walletAddress || (isDemoMode ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" : "T...")
  );

  // Reset or initialize state strictly upon opening modal
  useEffect(() => {
    if (isOpen) {
      setHasAuthorized(false);
      setTxHash(null);
      setIsTechnicalExpanded(false);

      if (!preflight.ready) {
        setLifecycleState("PREFLIGHT_FAILED");
        const balanceCheck = preflight.checks.find((c) => c.key === "BALANCE_SUFFICIENT");
        if (balanceCheck && !balanceCheck.passed) {
          setStatusMessage(
            `Nile TRX 잔고가 부족합니다 (보유: ${preflight.currentBalanceTrx} TRX / 필요: ${preflight.requiredTotalTrx} TRX). 테스트넷 Faucet 충전이 필요합니다.`
          );
        } else {
          setStatusMessage("사전 실행 조건을 충족하지 못했습니다. 지갑 연결 및 네트워크를 확인해 주세요.");
        }
      } else {
        setLifecycleState("REVIEW");
        setStatusMessage("실행 조건을 검토한 후 승인 체크박스를 선택해 주세요.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, plan?.id, leg?.asset, isDemoMode, trxBalance]);

  // Update state when checkbox toggles (only if in initial phase)
  useEffect(() => {
    if (["REVIEW", "PREFLIGHT_FAILED", "READY_TO_SIGN"].includes(lifecycleState)) {
      if (!preflight.ready) {
        setLifecycleState("PREFLIGHT_FAILED");
      } else if (hasAuthorized) {
        setLifecycleState("READY_TO_SIGN");
        setStatusMessage("서명 준비 완료: [트랜잭션 승인 및 서명] 버튼을 눌러 진행해 주세요.");
      } else {
        setLifecycleState("REVIEW");
        setStatusMessage("실행 조건을 검토한 후 승인 체크박스를 선택해 주세요.");
      }
    }
  }, [hasAuthorized, preflight.ready, lifecycleState]);

  if (!isOpen || !plan || !leg) return null;

  const handleExecute = async () => {
    if (lifecycleState !== "READY_TO_SIGN" || !hasAuthorized || !preflight.ready) {
      return;
    }

    setLifecycleState("AWAITING_WALLET_SIGNATURE");
    setStatusMessage("TronLink 지갑 서명 요청 중입니다. 확장 프로그램 팝업창에서 서명을 승인해 주세요...");

    try {
      if (isDemoMode) {
        // Safe simulated Nile transaction strictly tagged as DEMO
        await new Promise((r) => setTimeout(r, 1500));
        const demoHash = "7f8b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b";
        setTxHash(demoHash);
        setLifecycleState("BROADCASTING");
        setStatusMessage("Nile 테스트넷으로 트랜잭션 브로드캐스트 완료. 온체인 영수증 확인 중...");

        await new Promise((r) => setTimeout(r, 2000));
        setLifecycleState("CONFIRMING");

        await new Promise((r) => setTimeout(r, 1000));
        setLifecycleState("CONFIRMED");
        setStatusMessage("트랜잭션이 온체인 블록에 최종 확정(CONFIRMED)되었습니다! (DEMO 모드)");

        await compassStorage.recordExecution({
          id: `exec-demo-${Date.now()}`,
          planId: plan.id,
          walletAddress: walletAddress || "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
          txHash: demoHash,
          asset: "TRX",
          amount: depositAmount,
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
        const res = await executeJTrxSupplyOnNile(preview);
        if (res.status === "REJECTED") {
          setLifecycleState("REJECTED");
          setStatusMessage("사용자가 지갑 서명을 취소/거부했습니다.");
          return;
        }

        setTxHash(res.txHash);
        setLifecycleState("BROADCASTING");
        setStatusMessage("Nile 테스트넷 브로드캐스트 완료. 트랜잭션 영수증 확인 중...");

        setLifecycleState("CONFIRMING");
        const pollRes = await pollTransactionStatus(res.txHash, 6, 2500);

        if (pollRes.status === "CONFIRMED" || pollRes.status === "PENDING") {
          setLifecycleState("CONFIRMED");
          setStatusMessage("트랜잭션이 온체인 블록에 최종 확정(CONFIRMED)되었습니다!");
        } else {
          setLifecycleState("FAILED");
          setStatusMessage("트랜잭션 실행 실패: 컨트랙트 실행 오류가 발생했습니다.");
          return;
        }

        await compassStorage.recordExecution({
          id: `exec-nile-${Date.now()}`,
          planId: plan.id,
          walletAddress,
          txHash: res.txHash,
          asset: "TRX",
          amount: depositAmount,
          targetContract: preview.targetContract,
          network: "NILE",
          dataScope: "LIVE_NILE",
          isDemo: false,
          status: "CONFIRMED",
          timestamp: new Date().toISOString(),
        });

        if (onExecutionCompleted) onExecutionCompleted(res.txHash);
      }
    } catch (err: any) {
      setLifecycleState("FAILED");
      setStatusMessage(err?.message || "트랜잭션 실행 중 오류가 발생했습니다.");
    }
  };

  const isInsufficientTrx =
    !isDemoMode &&
    preflight.checks.some((c) => c.key === "BALANCE_SUFFICIENT" && !c.passed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#0F172A] border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-900/60 border border-purple-700/60 flex items-center justify-center text-purple-300">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Nile 테스트넷 실행 검토
                </h3>
                <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-semibold">
                  {isDemoMode ? "DEMO 모드" : "NILE TESTNET"}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                인간 승인(Human-in-the-Loop) 원칙에 따라 사용자 서명 없이 자산이 이동되지 않습니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Action Overview Box */}
          <div className="rounded-xl bg-gray-950/80 border border-gray-800/90 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-800/80">
              <span className="text-xs text-gray-400 font-medium">실행 대상 작업</span>
              <span className="text-xs font-bold text-white font-mono bg-purple-950/70 border border-purple-800/50 px-2.5 py-0.5 rounded">
                JustLend Supply ({depositAmount} TRX)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500 block text-[11px]">프로토콜</span>
                <span className="text-white font-semibold">JustLend DAO</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[11px]">네트워크</span>
                <span className="text-purple-300 font-semibold">Nile Testnet</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[11px]">지갑 보유 잔고</span>
                <span className={`font-mono font-semibold ${isInsufficientTrx ? "text-amber-400 font-bold" : "text-white"}`}>
                  {isDemoMode ? "500.00 TRX" : `${trxBalance} TRX`}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[11px]">예상 네트워크 비용</span>
                <span className="text-gray-300 font-mono">15 ~ 25 TRX (에너지)</span>
              </div>
            </div>

            {/* Deposit Amount Adjuster */}
            <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between">
              <span className="text-xs text-gray-400">예치 수량:</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING", "CONFIRMED"].includes(lifecycleState)}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-24 bg-gray-900 border border-gray-700 text-white font-mono font-bold text-xs rounded-lg px-2.5 py-1.5 text-right focus:outline-none focus:border-purple-500"
                />
                <span className="text-xs text-gray-300 font-semibold">TRX</span>
              </div>
            </div>
          </div>

          {/* Insufficient Balance Alert & Faucet CTA */}
          {isInsufficientTrx && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs space-y-2.5 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="text-amber-300 font-bold block text-sm">
                    ⚠ Insufficient Nile TRX (Nile TRX 잔고 부족)
                  </strong>
                  <p className="text-amber-200/90 text-xs mt-1">
                    현재 연결된 지갑에 잔고가 부족합니다 (보유: {preflight.currentBalanceTrx} TRX).
                    트랜잭션 실행에는 예치금({depositAmount} TRX)과 온체인 에너지/대역폭 버퍼(20 TRX)를 합산하여 총{" "}
                    <strong>{preflight.requiredTotalTrx} TRX</strong>가 필요합니다.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between">
                <span className="text-[11px] text-amber-300/80">
                  Nile 공식 Faucet에서 무료 테스트 TRX를 지급받으실 수 있습니다.
                </span>
                <a
                  href="https://nileex.io/join/getJoinPage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs px-3 py-1.5 rounded-lg shadow transition-colors"
                >
                  <Droplets className="w-3.5 h-3.5" />
                  <span>Get Test TRX (Faucet)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Progressive Disclosure: Collapsible Technical Details */}
          <div className="rounded-xl border border-gray-800/80 bg-gray-950/40 overflow-hidden text-xs">
            <button
              onClick={() => setIsTechnicalExpanded(!isTechnicalExpanded)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-gray-400 hover:text-white transition-colors bg-gray-900/30"
            >
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <span>기술 세부 정보 (Technical Details & Contract Info)</span>
              </span>
              {isTechnicalExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {isTechnicalExpanded && (
              <div className="p-4 space-y-2 border-t border-gray-800/60 bg-gray-950/80">
                <div className="flex items-center justify-between py-1 border-b border-gray-800/40">
                  <span className="text-gray-500 text-[11px]">대상 컨트랙트 (Nile jTRX)</span>
                  <span className="text-purple-300 font-mono text-[11px] select-all">
                    {preview.targetContract}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-800/40">
                  <span className="text-gray-500 text-[11px]">호출 메서드</span>
                  <span className="text-emerald-400 font-mono text-[11px]">{preview.method}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-800/40">
                  <span className="text-gray-500 text-[11px]">원시 송금값 (CallValue)</span>
                  <span className="text-gray-300 font-mono text-[11px]">{preview.amountRaw} sun</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500 text-[11px]">에너지 한도 (FeeLimit)</span>
                  <span className="text-gray-300 font-mono text-[11px]">100,000,000 sun (100 TRX)</span>
                </div>
              </div>
            )}
          </div>

          {/* User Confirmation Checkbox (Only visible when not already confirmed) */}
          {lifecycleState !== "CONFIRMED" && (
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 flex items-start gap-3">
              <input
                type="checkbox"
                id="auth-check"
                disabled={isInsufficientTrx || ["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING"].includes(lifecycleState)}
                checked={hasAuthorized}
                onChange={(e) => setHasAuthorized(e.target.checked)}
                className="mt-0.5 rounded border-gray-700 text-purple-600 focus:ring-purple-500 w-4 h-4 bg-gray-900 cursor-pointer disabled:opacity-50"
              />
              <label htmlFor="auth-check" className="text-xs text-purple-200 cursor-pointer select-none leading-relaxed">
                <strong>명시적 실행 동의: </strong>
                Nile 테스트넷 상의 대상 컨트랙트 주소 및 {depositAmount} TRX 예치 트랜잭션 내용을 확인하였으며, 지갑 서명 요청에 동의합니다.
              </label>
            </div>
          )}

          {/* Status and Result Box */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                lifecycleState === "CONFIRMED"
                  ? "bg-emerald-950/50 border border-emerald-700/80 text-emerald-200"
                  : lifecycleState === "FAILED" || lifecycleState === "REJECTED"
                  ? "bg-red-950/40 border border-red-800 text-red-200"
                  : lifecycleState === "PREFLIGHT_FAILED"
                  ? "bg-gray-900 border border-gray-800 text-gray-300"
                  : "bg-blue-950/40 border border-blue-800 text-blue-200"
              }`}
            >
              {["AWAITING_WALLET_SIGNATURE", "BROADCASTING", "CONFIRMING"].includes(lifecycleState) ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5 text-blue-400" />
              ) : lifecycleState === "CONFIRMED" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : lifecycleState === "PREFLIGHT_FAILED" || isInsufficientTrx ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              )}

              <div className="flex-1">
                <div className="font-medium">{statusMessage}</div>
                {txHash && (
                  <div className="mt-2 pt-2 border-t border-emerald-800/40 flex items-center justify-between flex-wrap gap-2">
                    <span className="font-mono text-[11px] text-gray-300 truncate max-w-xs">
                      TX: {txHash}
                    </span>
                    <a
                      href={`https://nile.tronscan.org/#/transaction/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold underline text-xs"
                    >
                      <span>Nile TronScan 검증 확인</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-gray-800 flex items-center justify-between bg-gray-950/80">
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            {lifecycleState === "CONFIRMED" ? "닫기" : "취소"}
          </button>

          {/* CRITICAL: A CONFIRMED transaction MUST NEVER show the Approve & Sign button */}
          {lifecycleState === "CONFIRMED" ? (
            <button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-950 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>실행 완료 (닫기)</span>
            </button>
          ) : (
            <button
              onClick={handleExecute}
              disabled={
                lifecycleState !== "READY_TO_SIGN" ||
                !hasAuthorized ||
                !preflight.ready ||
                isInsufficientTrx
              }
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-purple-950 transition-colors"
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
                  <span>Approve & Sign Transaction</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
