"use client";

import React from "react";
import { CheckCircle2, FileCheck2, ShieldAlert } from "lucide-react";
import { DecisionAlternative, DecisionReceipt } from "@/domain/decision/receipt";
import { Decimal, toPercentString } from "@/lib/math/decimal";
import { describeLegacyPlanExecutability } from "@/domain/allocation/executability";
import { formatReceiptAmount as humanAmount, getReceiptBalanceStatus as balanceStatus, receiptAssetIds, selectReceiptEvidence } from "@/domain/decision/receipt-presentation";

interface DecisionReceiptPanelProps {
  receipt: DecisionReceipt | null;
  isCheckingChainStatus?: boolean;
}

function shortValue(value: string | null | undefined, edge = 6): string {
  if (!value) return "Unavailable";
  return value.length > edge * 2 + 3 ? `${value.slice(0, edge)}…${value.slice(-edge)}` : value;
}

function sourceName(source: string): string {
  try {
    const host = new URL(source).hostname.replace(/^www\./, "");
    if (host.includes("just")) return "JustLend";
    if (host.includes("usdd")) return "USDD";
    return host;
  } catch {
    return source;
  }
}

function expectedNet(option: DecisionAlternative): string {
  if (option.valuationStatus === "UNAVAILABLE") return "Unavailable";
  if (option.incentiveYield === null || option.estimatedCost === null) return "Unavailable";
  try {
    const amount = new Decimal(option.baseYield).plus(option.incentiveYield).minus(option.estimatedCost).toFixed(2);
    return option.valuationStatus === "SIMULATED" ? `SIMULATED ${amount}` : amount;
  } catch {
    return "Unavailable";
  }
}

function statusText(status: ReturnType<typeof balanceStatus>): string {
  if (status === "VERIFIED") return "Balance directions verified";
  if (status === "STALE") return "Balance evidence stale · no verified delta";
  if (status === "PENDING") return "Balance refresh pending";
  return "Balance evidence unavailable";
}

function explorerUrl(receipt: DecisionReceipt): string | null {
  if (!receipt.execution.txHash) return null;
  const isNile = receipt.execution.network?.toLowerCase().includes("nile");
  return `${isNile ? "https://nile.tronscan.org" : "https://tronscan.org"}/#/transaction/${receipt.execution.txHash}`;
}

function compactAlternative(option: DecisionAlternative, selected: boolean, reserve: string, horizon: string) {
  const passed = option.ruleEvaluation.every((item) => item.passed);
  return (
    <article key={option.planId} className={`rounded-2xl border p-4 ${selected ? "border-indigo-200 bg-indigo-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900">{selected ? "Selected plan" : "Alternative considered"} · {option.planId}</h4>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{describeLegacyPlanExecutability(option.executionReality)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div><span className="block text-slate-500">Expected net</span><b className="text-slate-900">{expectedNet(option)} USDT-eq</b></div>
        <div><span className="block text-slate-500">Risk</span><b className="text-slate-900">{option.risks[0] ?? "No specific risk recorded"}</b></div>
        <div><span className="block text-slate-500">Minimum reserve</span><b className="text-slate-900">{reserve} USDT-eq</b></div>
        <div><span className="block text-slate-500">Horizon</span><b className="text-slate-900">{horizon}</b></div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Plan rules: {passed ? "PASS" : "STOP"} · {option.valuationStatus ?? "valuation status unavailable"}</p>
    </article>
  );
}

export function DecisionReceiptPanel({ receipt, isCheckingChainStatus = false }: DecisionReceiptPanelProps) {
  if (!receipt) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs" aria-label="Decision Receipt">
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

  const selected = receipt.alternatives.find((option) => option.planId === receipt.selection.planId);
  const alternative = receipt.alternatives.find((option) => option.planId !== receipt.selection.planId);
  const visibleOptions = [selected, alternative].filter((item): item is DecisionAlternative => !!item);
  const evidence = selectReceiptEvidence(receipt, visibleOptions);
  const marketEvidence = evidence.filter((item) => !item.field.startsWith("portfolio.holdings."));
  const valuationEvidence = evidence.filter((item) => item.field.startsWith("portfolio.holdings."));
  const latestReview = receipt.reviews[receipt.reviews.length - 1];
  const uniqueQuotes = [...new Set(receipt.rules.items.map((rule) => rule.sourceQuote).filter((quote): quote is string => !!quote))];
  const reserveRule = receipt.rules.items.find((rule) => rule.type === "MINIMUM_LIQUIDITY");
  const reserve = reserveRule ? humanAmount(reserveRule.value) : "Unavailable";
  const horizon = receipt.horizonDays ? `${receipt.horizonDays} days` : "Not recorded";
  const included = [...new Map(receipt.screening.included.map((item) => [item.opportunityId, item])).values()];
  const excluded = [...new Map(receipt.screening.excluded.map((item) => [item.opportunityId, item])).values()];
  const balanceEvidenceStatus = balanceStatus(receipt);
  const txUrl = explorerUrl(receipt);
  const approval = receipt.approval.shown;
  const assumptions = receipt.assumptions.filter((item) => {
    const id = item.sourceField.split(".")[0]?.toLowerCase();
    return visibleOptions.length === 0 || receiptAssetIds(visibleOptions).has(id) || /usdd/i.test(`${item.sourceField} ${item.description}`);
  }).slice(0, 3);

  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7" aria-label="Decision Receipt">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><FileCheck2 className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Decision Receipt #{receipt.id.slice(-6)}</h2>
              {receipt.parentId && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">CHILD OF #{receipt.parentId.slice(-6)}</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">Frozen {new Date(receipt.createdAt).toLocaleString()}</p>
            <p className="text-xs text-slate-500">Investment horizon: <strong className="text-slate-700">{horizon}</strong></p>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Decision integrity</span>
          <span className="font-mono text-xs font-bold text-slate-700" title={receipt.integrity.decisionHash}>SHA-256 {shortValue(receipt.integrity.decisionHash, 6)}</span>
        </div>
      </header>

      <section aria-labelledby="receipt-rules-title">
        <div className="mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><h3 id="receipt-rules-title" className="text-xs font-bold uppercase tracking-wide text-slate-500">1 · Why this position exists · My Rules v{receipt.rules.version}</h3></div>
        {receipt.rules.items.length ? <ul className="grid gap-2 sm:grid-cols-2">
          {receipt.rules.items.map((rule) => (
            <li key={rule.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
              <strong className="text-slate-900">{rule.id} · {rule.type.replaceAll("_", " ")}</strong>
              <p className="mt-1 text-slate-600">{rule.predicate} {rule.type === "MAX_VOLATILE_EXPOSURE" ? toPercentString(rule.value) : `${humanAmount(rule.value)}${rule.type === "MINIMUM_LIQUIDITY" ? " USDT-eq" : ""}`}</p>
            </li>
          ))}
        </ul> : <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">My Rules have not been confirmed. Signing is blocked until confirmation.</p>}
        {!!uniqueQuotes.length && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Original user request</summary><p className="mt-2 rounded-lg bg-slate-50 p-3">“{uniqueQuotes.join(" · ")}”</p></details>}
      </section>

      <section aria-labelledby="receipt-decision-title">
        <h3 id="receipt-decision-title" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">2 · Decision</h3>
        {visibleOptions.length ? <div className="space-y-2">{visibleOptions.map((option) => compactAlternative(option, option.planId === receipt.selection.planId, reserve, horizon))}</div> : <p className="text-xs text-slate-500">No selected plan was recorded.</p>}
      </section>

      <section aria-labelledby="receipt-evidence-title">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 id="receipt-evidence-title" className="text-xs font-bold uppercase tracking-wide text-slate-500">3 · Key evidence</h3><span className="text-[10px] text-slate-400">LIVE MAINNET · source feed · SNAPSHOT · frozen at decision</span></div>
        {marketEvidence.length || valuationEvidence.length ? <div className="grid gap-2 sm:grid-cols-2">
          {marketEvidence.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-900">{item.field.split(".")[0]}</strong><span className="text-[10px] text-slate-500">{item.observedReality ?? item.reality}</span></div>
              <p className="mt-1 text-xs text-slate-700">{item.field.endsWith("baseApy") ? "Base" : "Incentive"} {item.value === null ? "Unavailable" : toPercentString(item.value)}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                {item.fetchedAt ? `Fetched ${new Date(item.fetchedAt).toLocaleTimeString()}` : "Fetch time unavailable"} · {item.source.startsWith("http") ? <a className="text-indigo-600 hover:underline" href={item.source} target="_blank" rel="noreferrer">{sourceName(item.source)} ↗</a> : sourceName(item.source)}
              </p>
            </div>
          ))}
          {valuationEvidence.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-900">{item.field.split(".")[2]} valuation</strong><span className="text-[10px] text-slate-500">{item.observedReality ?? item.reality}</span></div>
              <p className="mt-1 text-xs text-slate-700">{humanAmount(item.value, 2)} USDT-eq</p>
              <p className="mt-1 text-[10px] text-slate-400">{item.fetchedAt ? `Fetched ${new Date(item.fetchedAt).toLocaleTimeString()}` : "Planning input · snapshot"}</p>
            </div>
          ))}
        </div> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No source-backed evidence for the selected plan was recorded.</p>}
      </section>

      <section aria-labelledby="receipt-assumptions-title">
        <h3 id="receipt-assumptions-title" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">4 · Assumptions</h3>
        {assumptions.length ? <div className="grid gap-2 sm:grid-cols-3">{assumptions.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-100 p-3 text-xs">
            <div className="flex items-center justify-between gap-2"><strong className="text-slate-900">{item.id}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "PASS" ? "bg-emerald-50 text-emerald-700" : item.status === "FAIL" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{item.status}</span></div>
            <p className="mt-1 text-slate-600">{item.description}</p>
          </div>
        ))}</div> : <p className="text-xs text-slate-500">No decision assumptions were recorded.</p>}
      </section>

      <section aria-labelledby="receipt-screening-title" className="rounded-xl bg-slate-50 p-3">
        <h3 id="receipt-screening-title" className="text-xs font-bold uppercase tracking-wide text-slate-600">Screening · {included.length} included · {excluded.length} excluded</h3>
        {!!included.length && <p className="mt-1 text-xs text-emerald-800">Included: {included.map((item) => item.item).join(" · ")}</p>}
        {!!excluded.length && <p className="mt-1 text-xs text-slate-500">{excluded.length} other markets did not match holdings or execution support.</p>}
        <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-indigo-700">View all screening details</summary>
          <div className="mt-2 space-y-1">{receipt.screening.included.map((item, index) => <p key={`in-${item.opportunityId}-${item.scope}-${index}`} className="text-emerald-800">Included · {item.item} · {item.scope} · {item.reason}</p>)}{receipt.screening.excluded.map((item, index) => <p key={`out-${item.opportunityId}-${item.scope}-${index}`} className="text-slate-600">Excluded · {item.item} · {item.scope} · {item.reason}</p>)}</div>
        </details>
      </section>

      <section aria-labelledby="receipt-approval-title">
        <h3 id="receipt-approval-title" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">5 · Approval</h3>
        {approval ? <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-slate-100 p-3 text-xs sm:grid-cols-3">
          <dt className="text-slate-500">Amount</dt><dd className="text-right font-semibold text-slate-900">{approval.amount}</dd>
          <dt className="text-slate-500">Network</dt><dd className="text-right font-semibold text-slate-900">{approval.network}</dd>
          <dt className="text-slate-500">Method</dt><dd className="text-right font-mono text-slate-900">{approval.method}</dd>
          <dt className="text-slate-500">Contract</dt><dd className="text-right font-mono text-slate-900" title={approval.contract}>{shortValue(approval.contract, 5)}</dd>
          <dt className="text-slate-500">Estimated fee / buffer</dt><dd className="text-right font-semibold text-slate-900">{approval.estimatedFee}</dd>
          <dt className="text-slate-500">Scope</dt><dd className="col-span-2 text-right text-slate-900 sm:col-span-1">{approval.scope}</dd>
        </dl> : <p className="text-xs text-slate-500">Approval details have not been shown yet.</p>}
      </section>

      <section aria-labelledby="receipt-chain-title">
        <h3 id="receipt-chain-title" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">6 · On-chain result</h3>
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-slate-800">{receipt.execution.network ?? "Nile execution"}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${receipt.execution.result === "CONFIRMED" ? "bg-emerald-50 text-emerald-700" : receipt.execution.result === "SIMULATED" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{receipt.execution.result}</span></div>
          {isCheckingChainStatus && <p role="status" className="mt-2 text-xs font-semibold text-indigo-700">Checking chain status…</p>}
          {receipt.execution.reconciledAt && receipt.execution.result === "CONFIRMED" && <p className="mt-2 text-[10px] font-semibold text-emerald-700">✓ Chain status reconciled</p>}
          {txUrl ? <p className="mt-2 font-mono text-xs text-slate-600">TX <a className="text-indigo-700 hover:underline" href={txUrl} target="_blank" rel="noreferrer">{shortValue(receipt.execution.txHash, 8)} ↗</a></p> : <p className="mt-2 text-xs text-slate-500">No on-chain transaction recorded.</p>}
          <p className="mt-1 text-xs text-slate-500">Block {receipt.execution.blockNumber ?? "Unavailable"} · Actual fee {receipt.execution.actualFee ?? "Unavailable"}</p>
          {receipt.execution.result === "CONFIRMED" && <div className="mt-2 space-y-1 text-xs text-slate-700">
            <p>Result: <strong>{receipt.execution.contractResult ?? "Unavailable"}</strong></p>
            {receipt.execution.balanceAction === "REDEEM" && receipt.execution.amount && <p>Redeemed: <strong>{humanAmount(receipt.execution.amount)} {receipt.execution.amountAsset ?? "jTRX"}</strong></p>}
            {receipt.execution.returnedTrxAmount && <p>Returned: <strong>{humanAmount(receipt.execution.returnedTrxAmount, 6)} TRX</strong></p>}
          </div>}
          {receipt.execution.result === "CONFIRMED" && <div className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-xs ${balanceEvidenceStatus === "VERIFIED" ? "bg-emerald-50 text-emerald-800" : balanceEvidenceStatus === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800"}`}>
            {balanceEvidenceStatus === "VERIFIED" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <div><strong>{statusText(balanceEvidenceStatus)}</strong>
              {balanceEvidenceStatus === "VERIFIED" ? <p className="mt-1">TRX {humanAmount(receipt.execution.trxBalanceBefore, 4)} → {humanAmount(receipt.execution.trxBalanceAfter, 4)} · Δ {humanAmount(receipt.execution.trxBalanceDelta, 4)}<br />jTRX {humanAmount(receipt.execution.jTrxBalanceBefore, 4)} → {humanAmount(receipt.execution.jTrxBalanceAfter, 4)} · Δ {humanAmount(receipt.execution.jTrxBalanceDelta, 4)}</p> : <p className="mt-1">Transaction confirmed on-chain. Balance delta: unavailable from trusted snapshots.</p>}
              {receipt.execution.balanceReality && <p className="mt-1 text-[10px]">Reality: {receipt.execution.balanceReality.replaceAll("_", " ")}</p>}
            </div>
          </div>}
          {receipt.execution.result !== "CONFIRMED" && <p className="mt-2 text-[10px] text-slate-500">Chain confirmation is recorded only from TronGrid.</p>}
        </div>
      </section>

      {latestReview && <section className="rounded-xl border border-slate-100 p-3" aria-labelledby="receipt-review-title">
        <h3 id="receipt-review-title" className="text-xs font-bold uppercase tracking-wide text-slate-500">7 · Latest review</h3>
        <p className="mt-1 text-xs text-slate-800">{latestReview.mode} · {latestReview.title}</p>
        <p className="mt-1 text-[10px] text-slate-500">{latestReview.assumptions.length} assumptions · {new Date(latestReview.reviewedAt).toLocaleString()}</p>
      </section>}

      <details className="border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-xs font-bold text-indigo-700">Technical audit details</summary>
        <p className="mt-2 text-[10px] text-slate-500">Exact saved receipt data, including full evidence, excluded markets, raw values, source URLs, transaction snapshots and integrity metadata.</p>
        {!!receipt.execution.statusHistory?.length && <ol aria-label="Transaction status observations" className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-[10px] text-slate-600">
          {receipt.execution.statusHistory.map((observation, index) => <li key={`${observation.source}-${observation.observedAt ?? "unknown"}-${index}`}>
            {observation.status} · {observation.source} · {observation.observedAt ? new Date(observation.observedAt).toLocaleString() : "timestamp not recorded"}
            {observation.blockNumber ? ` · block ${observation.blockNumber}` : ""}{observation.contractResult ? ` · ${observation.contractResult}` : ""}
          </li>)}
        </ol>}
        <pre className="mt-2 max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-[10px] leading-relaxed text-slate-100">{JSON.stringify(receipt, null, 2)}</pre>
      </details>
    </section>
  );
}
