# TRON Compass

**TRON Compass turns a conversation about your money into a yield decision that can be verified before signing and re-checked when its assumptions change.**

> In DeFi, positions often outlive the reasons they were opened.

GWDC 2026 TRON Challenge B project. The product keeps the original rules, evidence and alternatives with a decision, blocks an unsafe Nile action, and lets the user review a simulated assumption change later.

**AI understands. Code verifies. You approve. TRON executes. The receipt remembers.**

## Responsibility boundary

- **AI:** parses the user's words, asks for missing details, and drafts an explanation. It is not authoritative for balances, market rates, fees, addresses, or allocation math.
- **Code:** calculates plans, applies confirmed investment rules, checks evidence age and execution scope, hashes the decision snapshot, and records blocked actions.
- **TRON / TronLink:** wallet signing and testnet execution only. TronGrid supplies independent post-broadcast block and result evidence. The app has no mainnet write path and never requests a private key or seed phrase.

## What existed before this pivot

- Gemini natural-language needs parsing with a deterministic fallback.
- Deterministic allocation, What-if recomputation, and Plan A / Plan B comparison.
- JustLend and USDD market-data adapters; Mainnet data is read-only.
- Nile jTRX Supply and Redeem call paths, TronLink signing, and TronGrid transaction verification code.
- Replay and user-reviewed rebalance proposals.

The repository contained Redeem code and unit tests before this work. That is not proof of a real wallet-to-chain Redeem flow; see **Redeem verification** below.

## Added or strengthened in this pivot

- **Decision Receipt:** browser-local persistence, deterministic SHA-256 over the pre-execution decision, and a consumer-facing review card for rules, evidence, options, assumptions, approval and chain state.
- **My Rules:** versioned rules keep the user's source quote and confirmation time. Planning, What-if, pre-sign edits, and replay proposals use the shared deterministic evaluator.
- **Evidence provenance:** JustLend base and USDD incentive yields, source-reported pool capacity and derived utilization carry their own source, terms, fetch time and reality label. Fallback market values have no synthetic fetch time. USDD thresholds are labeled `COMPASS_POLICY`.
- **Portfolio and execution reality:** planner quantities are `USER_DECLARED` hypothetical Mainnet holdings. Connected Nile `TRX` and `jTRX` balances are `NILE_LIVE` execution capacity only and never become the Mainnet planning portfolio. Demo holdings remain `SIMULATED`. Allocation and signing require fresh JustLend Mainnet `USDT-equivalent` values for every declared holding; unavailable evidence blocks the action and records a stop.
- **Screening and review:** receipts show included and excluded opportunities with reasons. Replay outcomes are labeled `SIMULATED`; failed assumptions can produce a rule-checked proposal and a child receipt without executing it.
- **Recorded stops:** unconfirmed rules, rule violations, stale evidence, approval mismatch, wrong network, unsupported leg, and failed preflight conditions are recorded before a wallet call. The gate runs again immediately before invoking TronLink.
- **Demo truthfulness:** demo actions are stored as `SIMULATED`, with no fabricated transaction hash, broadcast or `CONFIRMED` state.

Receipts are stored in the browser's local storage and are not written on-chain or synchronized between browsers. The hash covers rules, evidence snapshot, screening, alternatives, assumptions, selection and approval details; transaction fields, stops and later reviews are outside that pre-execution hash.

## Evidence and yield

- JustLend base APY comes from [`/lend/jtoken`](https://openapi.just.network/lend/jtoken)'s `supplyRate`; USDD mining incentive APY comes from the separate [`/mining/apy`](https://openapi.just.network/mining/apy) feed. The app records each source and fetch time independently. The [JustLend API reference](https://docs.justlend.org/developers/apis/) defines total supply APY as base + incentive; a zero or omitted market entry means no active mining. If the incentive feed is unavailable, incentive-dependent net return and combined APY remain `UNAVAILABLE`.
- USDD collateral thresholds of 130% and 110% are TRON Compass policy thresholds, not official USDD risk categories. Missing or snapshot USDD evidence excludes new USDD allocation.
- `LIVE MAINNET`, `NILE LIVE`, `SNAPSHOT` and `SIMULATED` label different observations. A receipt stores a `SNAPSHOT` and preserves the reality label of the observation it froze.
- Fee buffers and entry/exit cost estimates are Compass policy estimates. They are not live quotes or observed transaction fees. A confirmed transaction's actual fee is recorded only when TronGrid returns its transaction `fee` field.
- Portfolio accounting uses JustLend Mainnet `/lend/jtoken` `underlyingPriceInTrx` values. For each asset, `amount × asset underlyingPriceInTrx ÷ USDT underlyingPriceInTrx` yields a `USDT-equivalent` value. The official [JustLend API reference](https://docs.justlend.org/developers/apis/) describes `underlyingPriceInTrx` as an underlying-asset price denominated in TRX. This is not a USD conversion and does not assume USDT parity. Values must share one fresh response snapshot; missing, invalid, inconsistent or stale prices remain unavailable. No third-party price fallback is used.
- The planner uses user-declared quantities, not connected wallet balances. Gemini explanations are rejected when their numeric claims are absent from the structured plan inputs.
- Source-reported JustLend `cash + totalBorrows` is retained in source units; this adapter does not claim that value is USD TVL.

## Execution flow

1. Enter hypothetical Mainnet asset quantities, confirm My Rules, inspect live market evidence and compare plans. Allocation requires fresh source-backed USDT-equivalent values for every declared holding; a missing value shows `UNAVAILABLE` and blocks allocation.
2. Select a supported Nile jTRX action and review the approval sheet: connected wallet, Nile network, live TRX/jTRX balances, amount and base units, estimated return when the live Nile exchange rate is available, contract, method, fee estimate, risks and approval scope.
3. Before signing, the execution gate checks confirmed rules, fresh Mainnet valuation and market evidence, refreshed Nile balances, network, the selected executable leg, allowlisted jTRX contract, method, amount and approval parity.
4. If a check fails, the action is `STOPPED`, a reason is saved in the receipt, and TronLink is not invoked.
5. If all checks pass, the user chooses whether to approve the TronLink request. A hash alone is not success; the app records `CONFIRMED` only after TronGrid reports successful execution and block inclusion.

The current TronLink integration does not read the final wallet-popup payload back for comparison. The receipt therefore reports wallet-payload parity as **NOT VERIFIED**. After TronGrid confirms a transaction, the app re-reads both Nile balances and records their deltas when both reads succeed. Actual fee is shown only if TronGrid returned the transaction's total `fee`; unavailable values stay unavailable.

## Redeem verification

The code audit confirms the configured Redeem preview uses `redeem(uint256)` with an 8-decimal jTRX amount and the execution path passes those raw jTRX units to the canonical Nile jTRX contract. The live review reads TRX and jTRX balances and uses Nile `exchangeRateStored` for an approximate TRX return when available. The balance preflight reads `balanceOf(address)` and formats it with 8 decimals. JustLend's documentation distinguishes `redeem` jToken units (8 decimals) from `redeemUnderlying` underlying units. [Deployed Contracts and unit guidance](https://docs.justlend.org/developers/deployed_contracts/), [JustLend glossary](https://docs.justlend.org/resources/glossary/).

The Nile contract and call path were checked read-only; no wallet signature was performed during this task. **Manual Redeem E2E: UNVERIFIED.** Do not present Redeem as proven until this flow is completed by a human on Nile:

1. Connect a Nile wallet that holds jTRX and enough TRX for the policy fee buffer.
2. Record the wallet's TRX and jTRX balances. Confirm the app's refreshed live jTRX balance matches `balanceOf`.
3. Enter a jTRX amount no greater than that balance. Review the amount in jTRX and raw 8-decimal units, approximate returned TRX if available, wallet, Nile network, `redeem(uint256)` method, configured Nile contract, risk and scope.
4. Approve the request in TronLink yourself. The application does not bypass this prompt.
5. Verify the transaction through TronGrid: block included and contract result successful.
6. Re-read both balances and confirm jTRX decreased and TRX increased. The receipt records the before/after values and deltas as `NILE_LIVE`, plus the actual fee if returned by TronGrid. Save the TX hash and receipt with the demo record.

If any check is unavailable or inconsistent, stop. Do not claim Redeem E2E success from code, ABI inspection or unit tests alone.

## What-if and replay

What-if stays local and deterministic; it makes no Gemini call and does not change confirmed My Rules. Replay scenarios modify local inputs and are never forecasts. A replayed proposal is evaluated by the shared rules and creates a child receipt only after the user selects it; it never broadcasts automatically.

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

`pnpm test` uses captured fixtures and mocked HTTP responses; the test setup blocks non-loopback network requests, so the default suite does not require internet access. `pnpm verify:live` is an optional, read-only health check for the current JustLend, USDD and Nile TronGrid endpoints. It makes bounded external requests and is separate from the deterministic test suite.

Copy `.env.example` to `.env.local` and configure server-side Gemini / TronGrid credentials if required. Do not commit `.env.local`, wallet secrets, test results or generated artifacts.

## Not implemented / not proven

- Frozen-input Recompute verifier, Shadow Plan, and dated liquidity rules (P1).
- On-chain receipt storage, transaction memo anchoring, automated rebalancing, mainnet writes, multi-sig and custom contracts (out of scope).
- Real manual Redeem E2E and any TX hash / before-and-after balance evidence (not yet supplied).
- Wallet-popup payload parity and fees/balances not returned by the current verification route.
