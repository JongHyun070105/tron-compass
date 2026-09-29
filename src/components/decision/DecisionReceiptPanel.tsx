"use client";

import React from "react";
import { CheckCircle2, CircleHelp, FileCheck2, ShieldAlert } from "lucide-react";
import { DecisionReceipt } from "@/domain/decision/receipt";
import { toPercentString } from "@/lib/math/decimal";

interface DecisionReceiptPanelProps {
  receipt: DecisionReceipt | null;
}

function evidenceLabel(field: string): string {
  if (field.startsWith("portfolio.holdings.")) {
    return field.endsWith(".origin")
      ? `${field.split(".")[2]} planning input reality`
      : `${field.split(".")[2]} USDT-equivalent valuation`;
  }
  if (field.endsWith(".baseApy")) return "Base yield";
  if (field.endsWith(".incentiveApy")) return "USDD mining incentive";
  if (field.endsWith(".totalApy")) return "Total APY (base + incentive)";
  if (field === "usdd.collateralRatioPct") return "USDD collateral ratio";
  if (field.endsWith(".utilizationPct")) return "Utilization";
  if (field.endsWith(".poolCapacitySourceUnits")) return "Pool cash + borrows (source units)";
  if (field.endsWith(".estimatedEntryCostUsdtEquivalent")) return "Estimated entry cost";
  if (field.endsWith(".estimatedExitCostUsdtEquivalent")) return "Estimated exit cost";
  return field;
}

function evidenceValue(field: string, value: string | null): string {
  if (value === null) return "Unavailable";
  if (field.endsWith(".baseApy") || field.endsWith(".incentiveApy") || field.endsWith(".totalApy") || field.endsWith(".utilizationPct")) {
    return toPercentString(value);
  }
  if (field.endsWith(".usdtEquivalentValue")) return `${value} USDT-equivalent`;
  return value;
}

function statusStyle(status: string): string {
  if (status === "PASS") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "FAIL") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "WARNING") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export function DecisionReceiptPanel({ receipt }: DecisionReceiptPanelProps) {
  if (!receipt) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <FileCheck2 className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-bold text-slate-900">Decision Receipt</h2>
            <p className="text-xs text-slate-500">Choose a plan to freeze its rules, evidence and alternatives.</p>
          </div>
        </div>
      </section>
    );
  }

  const selected = receipt.alternatives.find((item) => item.planId === receipt.selection.planId);
  const latestReview = receipt.reviews[receipt.reviews.length - 1];
  const evidence = receipt.evidence;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-7" aria-label="Decision Receipt">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <FileCheck2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Decision Receipt #{receipt.id.slice(-6)}</h2>
              {receipt.parentId && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">CHILD OF #{receipt.parentId.slice(-6)}</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">WHY THIS POSITION EXISTS · Frozen {new Date(receipt.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Decision integrity</span>
          <span className="font-mono text-xs font-bold text-slate-700" title={receipt.integrity.decisionHash}>
            SHA-256 {receipt.integrity.decisionHash ? `${receipt.integrity.decisionHash.slice(0, 12)}…` : "Unavailable"}
          </span>
        </div>
      </header>

      <div className="grid gap-7 lg:grid-cols-2">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">My Rules · v{receipt.rules.version}</h3>
            {receipt.rules.items.length ? (
              <div className="space-y-2">
                {receipt.rules.items.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <strong className="text-slate-900">{rule.id} · {rule.type.replaceAll("_", " ")} v{rule.version}</strong>
                      <p className="mt-0.5 text-slate-600">{rule.predicate} {rule.type === "MAX_VOLATILE_EXPOSURE" ? toPercentString(rule.value) : rule.value}</p>
                      {rule.sourceQuote && <p className="mt-1 border-l-2 border-indigo-200 pl-2 text-[11px] text-slate-500">“{rule.sourceQuote}”</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">My Rules have not been confirmed. Signing is blocked until confirmation.</p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Market evidence</h3>
            {evidence.length ? (
              <div className="space-y-2">
                {evidence.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-xs text-slate-800">{evidenceLabel(item.field)}</strong>
                      <span className="font-mono text-xs font-bold text-slate-900">{evidenceValue(item.field, item.value)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
                      <span>{item.reality}{item.observedReality ? ` · observed ${item.observedReality}` : ""}</span>
                      <span>·</span>
                      <span>{item.fetchedAt ? new Date(item.fetchedAt).toLocaleString() : "fetch time unavailable"}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-400" title={item.terms ?? ""}>{item.terms ?? "Terms unavailable"}</p>
                    {item.source.startsWith("https://") || item.source.startsWith("http://")
                      ? <a className="mt-1 block truncate text-[10px] text-indigo-600 hover:underline" href={item.source} target="_blank" rel="noreferrer">{item.source}</a>
                      : <span className="mt-1 block truncate text-[10px] text-slate-500">{item.source}</span>}
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">Evidence is unavailable.</p>}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Assumptions</h3>
            <div className="space-y-2">
              {(latestReview?.assumptions ?? receipt.assumptions).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div>
                    <strong className="text-xs text-slate-800">{item.id} · {item.description}</strong>
                    <p className="mt-1 text-[10px] text-slate-500">Threshold {item.predicate} {item.threshold} · {item.thresholdProvenance.replaceAll("_", " ")}</p>
                    {item.reason && <p className="mt-1 text-[10px] text-amber-700">{item.reason}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyle(item.status)}`}>{item.status}</span>
                </div>
              ))}
              {!receipt.assumptions.length && <p className="text-xs text-slate-500">No assumptions were supported by this decision evidence.</p>}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Options considered</h3>
            <div className="space-y-2">
              {receipt.alternatives.map((option) => (
                <div key={option.planId} className={`rounded-xl border p-3 ${option.planId === receipt.selection.planId ? "border-indigo-200 bg-indigo-50/50" : "border-slate-100"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs text-slate-900">{option.planId === receipt.selection.planId ? "SELECTED · " : ""}{option.planId}</strong>
                    <span className="text-[10px] font-semibold text-slate-500">{[option.executionReality.replaceAll("_", " "), option.valuationStatus].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <span>Base<br /><b className="text-xs text-slate-800">{option.valuationStatus === "UNAVAILABLE" ? "UNAVAILABLE" : `${option.valuationStatus === "SIMULATED" ? "SIMULATED " : ""}${option.baseYield} USDT-eq`}</b></span>
                    <span>Incentive<br /><b className="text-xs text-slate-800">{option.valuationStatus === "UNAVAILABLE" || option.incentiveYield === null ? "Unavailable" : `${option.valuationStatus === "SIMULATED" ? "SIMULATED " : ""}${option.incentiveYield} USDT-eq`}</b></span>
                    <span>Compass policy cost estimate<br /><b className="text-xs text-slate-800">{option.valuationStatus === "UNAVAILABLE" || option.estimatedCost === null ? "Unavailable" : `${option.valuationStatus === "SIMULATED" ? "SIMULATED " : ""}${option.estimatedCost} USDT-eq`}</b></span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">Rules: {option.ruleEvaluation.every((item) => item.passed) ? "PASS" : "STOP · one or more rules failed"}</p>
                </div>
              ))}
              {!receipt.alternatives.length && <p className="text-xs text-slate-500">No alternatives were recorded.</p>}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Screening</h3>
            <div className="space-y-2">
              {receipt.screening.included.map((item) => (
                <div key={`in-${item.opportunityId}-${item.scope}`} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                  <strong className="text-xs text-emerald-900">INCLUDED · {item.item} · {item.scope}</strong>
                  <p className="mt-1 text-[10px] text-emerald-800">{item.reason}</p>
                </div>
              ))}
              {receipt.screening.excluded.map((item, index) => (
                <div key={`out-${item.opportunityId}-${item.scope}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <strong className="text-xs text-slate-800">EXCLUDED · {item.item} · {item.scope}</strong>
                  <p className="mt-1 text-[10px] text-slate-600">{item.reason}</p>
                </div>
              ))}
              {!receipt.screening.included.length && !receipt.screening.excluded.length && <p className="text-xs text-slate-500">No screening results were recorded.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">What I approved</h3>
            {receipt.approval.shown ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <dt className="text-slate-500">Amount</dt><dd className="text-right font-semibold text-slate-900">{receipt.approval.shown.amount}</dd>
                <dt className="text-slate-500">Network</dt><dd className="text-right font-semibold text-slate-900">{receipt.approval.shown.network}</dd>
                <dt className="text-slate-500">Fee estimate</dt><dd className="text-right font-semibold text-slate-900">{receipt.approval.shown.estimatedFee}</dd>
                <dt className="text-slate-500">Method</dt><dd className="text-right font-mono text-slate-900">{receipt.approval.shown.method}</dd>
                <dt className="text-slate-500">Contract</dt><dd className="truncate text-right font-mono text-slate-900" title={receipt.approval.shown.contract}>{receipt.approval.shown.contract}</dd>
                <dt className="text-slate-500">Signer</dt><dd className="truncate text-right font-mono text-slate-900">{receipt.approval.signer ?? "Unavailable"}</dd>
              </dl>
            ) : <p className="mt-2 text-xs text-slate-500">Approval details have not been shown yet.</p>}
            <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-[10px] text-amber-800">
              <CircleHelp className="h-4 w-4 shrink-0" /> Wallet popup payload comparison: NOT VERIFIED by the current provider flow.
            </div>
            {receipt.approval.shown?.risks?.length ? <p className="mt-2 text-[10px] text-slate-500">Risks: {receipt.approval.shown.risks.join(" · ")}</p> : null}
            {receipt.approval.shown?.scope && <p className="mt-1 text-[10px] text-slate-500">Scope: {receipt.approval.shown.scope}</p>}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">On-chain result</h3>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{receipt.execution.network ?? "Nile execution"}</span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${receipt.execution.result === "CONFIRMED" ? "bg-emerald-50 text-emerald-700" : receipt.execution.result === "SIMULATED" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{receipt.execution.result}</span>
              </div>
              {receipt.execution.txHash ? <p className="mt-2 break-all font-mono text-[10px] text-slate-600">TX {receipt.execution.txHash}</p> : <p className="mt-2 text-[10px] text-slate-500">No on-chain transaction recorded.</p>}
              {receipt.execution.amountAsset && <p className="mt-1 text-[10px] text-slate-500">Amount: {receipt.execution.amount ?? "Unavailable"} {receipt.execution.amountAsset} · {receipt.execution.amountRaw ?? "Unavailable"} raw units</p>}
              {receipt.execution.contractResult && <p className="mt-1 text-[10px] text-slate-500">TronGrid receipt: {receipt.execution.contractResult}</p>}
              <p className="mt-2 text-[10px] text-slate-500">Block: {receipt.execution.blockNumber ?? "Unavailable"} · Actual fee: {receipt.execution.actualFee ?? "Unavailable"}</p>
              {receipt.execution.trxBalanceBefore !== undefined || receipt.execution.jTrxBalanceBefore !== undefined ? (
                <div className="mt-1 space-y-1 text-[10px] text-slate-500">
                  <p>Balance reality: {receipt.execution.balanceReality ?? "NILE_LIVE · partial or unavailable"}</p>
                  <p>TRX: {receipt.execution.trxBalanceBefore ?? "Unavailable"} → {receipt.execution.trxBalanceAfter ?? "Unavailable"} · Δ {receipt.execution.trxBalanceDelta ?? "Unavailable"} TRX</p>
                  <p>jTRX: {receipt.execution.jTrxBalanceBefore ?? "Unavailable"} → {receipt.execution.jTrxBalanceAfter ?? "Unavailable"} · Δ {receipt.execution.jTrxBalanceDelta ?? "Unavailable"} jTRX</p>
                </div>
              ) : <p className="mt-1 text-[10px] text-slate-500">Balance before / after: {receipt.execution.balanceBefore ?? "Unavailable"} / {receipt.execution.balanceAfter ?? "Unavailable"}</p>}
              <p className="mt-1 text-[10px] text-slate-500">Chain confirmation is recorded only from TronGrid.</p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Recorded stops</h3>
            {receipt.stops.length ? receipt.stops.map((stop) => (
              <div key={stop.id} className="mb-2 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <div><strong>{stop.ruleId ?? stop.guardId} · STOPPED</strong><p className="mt-1">{stop.reason}</p><p className="mt-1 text-[10px]">{stop.attemptedAction} · {stop.attemptedAmount ?? "amount unavailable"}</p></div>
              </div>
            )) : <p className="text-xs text-slate-500">No blocked action recorded.</p>}
          </section>

          {receipt.parentId && <p className="border-t border-slate-100 pt-3 text-[10px] text-slate-500">Parent receipt: {receipt.parentId} · this proposal remains unexecuted until separately approved.</p>}
          {latestReview && <p className="text-[10px] text-slate-500">Latest review: {latestReview.title} · {latestReview.mode} · {new Date(latestReview.reviewedAt).toLocaleString()}</p>}
          {selected?.executionReality === "LIVE_DATA_ONLY" && <p className="text-[10px] text-slate-500">Selected plan includes no currently supported Nile route.</p>}
        </div>
      </div>
    </section>
  );
}
