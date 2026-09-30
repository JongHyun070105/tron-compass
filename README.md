# TRON Compass

> **Verifiable yield decisions on TRON — before you sign, and after the market moves.**

TRON Compass is a GWDC 2026 **TRON Challenge B** project that turns a conversation about a user's money into a yield decision that can be checked, approved, executed on TRON Nile, and reviewed again when its assumptions change.

**AI understands. Code verifies. You approve. TRON executes. The receipt remembers.**

## Why TRON Compass

Most yield apps optimize for entry: show an APY, pick a pool, deposit.

TRON Compass focuses on the whole decision loop:

```text
Natural-language needs
        ↓
Confirmed My Rules
        ↓
LIVE TRON market evidence
        ↓
Deterministic Plan A / Plan B
        ↓
Pre-sign safety checks
        ↓
TronLink approval
        ↓
Nile execution
        ↓
TronGrid verification
        ↓
Decision Receipt
        ↓
Assumption Review
```

The core idea is simple:

> **A yield position should remember why it was opened.**

If the evidence or assumptions behind that decision change later, TRON Compass can re-check the original reasoning and propose a new action. It never rebalances automatically.

## What makes it different

### 1. AI is not the source of financial truth

Gemini is used for:

- understanding natural-language needs;
- asking for missing information;
- drafting structured rules;
- explaining deterministic results.

Gemini is **not authoritative** for balances, APYs, fees, token prices, contract addresses, transaction data, or allocation math.

Those values come from code and source-backed TRON data.

### 2. My Rules are executable constraints

Confirmed user rules are evaluated by one deterministic rule engine during:

- planning;
- What-if changes;
- pre-sign validation;
- later assumption/rebalance proposals.

A blocked action is recorded instead of silently disappearing.

### 3. Every important number carries provenance

TRON Compass separates:

- `LIVE MAINNET`
- `NILE LIVE`
- `SNAPSHOT`
- `SIMULATED`
- `USER DECLARED`

JustLend base yield and USDD mining incentive are kept separate. Market evidence records source, fetch time, applicable terms, and reality label.

### 4. Decision Receipt

The Decision Receipt records the context behind a decision:

- confirmed My Rules;
- frozen evidence;
- alternatives considered;
- screening results;
- machine-checkable assumptions;
- approval details;
- execution state;
- stops and later reviews.

The pre-execution decision snapshot is hashed with SHA-256.

The receipt itself stays off-chain; real execution is linked by its transaction hash.

## Real TRON integration

TRON is used at three distinct points.

| Layer | Role |
|---|---|
| **TRON Mainnet / JustLend / USDD** | Read-only market evidence for planning |
| **TronLink + Nile Testnet** | User-authorized execution |
| **TronGrid / chain receipt** | Independent transaction verification |

Mainnet writes are intentionally disabled.

The server never asks for or stores a private key, mnemonic, or seed phrase.

## Verified on-chain execution

TRON Compass has a real Nile Testnet Redeem execution.

| Field | Result |
|---|---|
| Network | TRON Nile Testnet |
| Contract | `TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq` |
| Method | `redeem(uint256)` |
| Redeemed | 100 jTRX |
| Returned | 1.117763 TRX |
| Block | `71382254` |
| Result | **SUCCESS / CONFIRMED** |
| Actual fee | 7.5699 TRX |
| TX | `4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286` |

[**View the transaction on Nile TronScan →**](https://nile.tronscan.org/transaction/4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286/overview)

A transaction hash alone is not success. TRON Compass marks a transaction `CONFIRMED` only after block inclusion and an explicit successful chain result.

During final QA, this transaction also exercised the reconciliation path: an earlier local `FAILED / REVERT` observation was later reconciled against authoritative chain truth and restored to `CONFIRMED`, while the previous observation remained in the audit history.

See **[docs/ONCHAIN_PROOF.md](docs/ONCHAIN_PROOF.md)** for the complete Supply/Redeem evidence, verification model, reconciliation behavior, and exact limits of what the chain proves.

## Market evidence and valuation

- JustLend base APY comes from [`/lend/jtoken`](https://openapi.just.network/lend/jtoken).
- USDD mining incentive APY comes from [`/mining/apy`](https://openapi.just.network/mining/apy).
- Total APY is derived from base + incentive; they remain visible separately.
- USDD collateral thresholds used by the product are labeled `COMPASS_POLICY`, not presented as official USDD risk categories.
- Portfolio accounting uses JustLend Mainnet `underlyingPriceInTrx` values to derive **USDT-equivalent** values.
- `USDT-equivalent` is not labeled USD and does not assume USDT = USD.
- Missing, invalid, inconsistent, or stale required evidence fails closed for new exposure.

Planner quantities are hypothetical `USER_DECLARED` Mainnet holdings. Connected Nile balances are execution capacity only and are never presented as the user's Mainnet portfolio.

## Execution safety

Before a wallet request, the app validates the relevant execution boundary:

- connected wallet and current network;
- allowlisted Nile jTRX contract;
- expected method;
- token precision and raw-unit conversion;
- available Nile balance;
- internal fee/resource safety buffer;
- confirmed rules;
- approval scope and explicit consent.

Supply increases exposure and remains fail-closed when required planning evidence is stale.

Redeem is treated as an exit / exposure-reducing action: unavailable non-essential Mainnet valuation must not trap the user in an existing Nile test position, while wallet, network, contract, amount, balance, method, and approval checks still remain mandatory.

## Transaction verification and reconciliation

The application does not trust a single transient status response.

```text
BROADCAST
   ↓
PENDING
   ↓
block inclusion + explicit SUCCESS
   ↓
CONFIRMED
```

Persisted `FAILED` or `PENDING` states with a real transaction hash can be reconciled against current chain truth. Once authoritative block-included success is observed, a later timeout or single inconsistent response cannot downgrade that transaction.

Implementation:

- [Transaction flow](src/lib/tron/transaction.ts)
- [Receipt reconciliation](src/domain/decision/transaction-reconciliation.ts)
- [Reconciliation tests](tests/transaction-reconciliation.test.ts)

## Assumption Review

A Decision Receipt is not the end of the workflow.

TRON Compass can replay an explicitly labeled `SIMULATED` market change and re-evaluate the assumptions behind the original decision.

It shows:

- which assumption changed;
- expected-return impact;
- a rule-checked proposal;
- no automatic execution.

Simulation is never presented as a live or observed result.

## Tech stack

- Next.js 15 / React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Gemini
- Decimal.js
- TronLink / TronWeb
- TronGrid
- JustLend
- USDD
- Nile Testnet
- Vitest

## Final P0 verification

Final P0 QA recorded:

- **155 / 155 deterministic tests passed twice**
- lint: PASS
- typecheck: PASS
- production build: PASS
- verified Nile Redeem persisted as `CONFIRMED` after reload
- transaction reconciliation preserved the same receipt and audit history
- **P0 COMPLETE**
- **FEATURE FREEZE: YES**

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

For local development:

```bash
pnpm dev
```

The normal test suite is deterministic and offline. External health checks are separate:

```bash
pnpm verify:live
```

Do not commit `.env.local`, API keys, wallet secrets, generated test output, or private credentials.

## Repository docs

- [Architecture](docs/ARCHITECTURE.md)
- [Decision loop](docs/DECISION_LOOP.md)
- [TRON integration audit](docs/TRON_INTEGRATION_AUDIT.md)
- [On-chain proof](docs/ONCHAIN_PROOF.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)

## Scope and limits

- Mainnet is read-only; there is no real-money Mainnet execution path.
- Decision Receipts are browser-local and are not stored on-chain.
- Replays are simulations, not forecasts.
- The chain proves that a valid wallet authorization existed; it does **not** prove which physical person clicked Sign.
- Connected-wallet execution and hypothetical Mainnet planning data remain deliberately separate.
