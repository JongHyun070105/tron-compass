# On-chain Proof

This document records the real Nile Testnet execution evidence used by **TRON Compass** for GWDC 2026 TRON Challenge B.

> The goal is to separate what the chain actually proves from what the application infers or simulates.

## Primary proof — jTRX Redeem

| Field | Verified value |
|---|---|
| Network | TRON Nile Testnet |
| Contract | `TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq` (JustLend jTRX) |
| Method | `redeem(uint256)` |
| Amount | 100 jTRX |
| Returned | 1.117763 TRX |
| Transaction | `4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286` |
| Block | `71382254` |
| Final result | **SUCCESS / CONFIRMED** |
| Actual fee | 7.5699 TRX |

**Explorer:** [View the Redeem transaction on Nile TronScan](https://nile.tronscan.org/transaction/4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286/overview)

The application uses the same canonical Nile jTRX contract that is configured in
[`src/lib/integrations/justlend/contracts.ts`](../src/lib/integrations/justlend/contracts.ts).

## Supporting proof — jTRX Supply

A prior Nile execution also demonstrated the supply path.

| Field | Verified value |
|---|---|
| Network | TRON Nile Testnet |
| Contract | `TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq` |
| Method | `mint()` |
| Supplied | 985 TRX |
| jTRX minted | 88,122.39013208 jTRX |
| Transaction | `855416e66dc73f0909cb822b28ec64a3a0e9c7b69c7580cb98c70e1971a1b41c` |
| Block | `71376676` |
| Final result | **SUCCESS / CONFIRMED** |
| Actual fee | 6.5894 TRX |

**Explorer:** [View the Supply transaction on Nile TronScan](https://nile.tronscan.org/transaction/855416e66dc73f0909cb822b28ec64a3a0e9c7b69c7580cb98c70e1971a1b41c/overview)

The old local balance snapshot from this supply run was later treated as stale and is **not** used as proof of the TRX balance delta. The on-chain transaction result itself remains the execution proof.


## Reproduce the proof

Run the repository verifier:

```bash
pnpm verify:onchain
```

The command performs read-only calls to Nile TronGrid for both fixed transaction hashes and exits non-zero if any required proof check fails. It checks:

- exact transaction hash;
- block inclusion;
- explicit `SUCCESS`;
- expected historical block;
- observed total fee.

Optional `TRONGRID_API_KEY` is read from the environment when available; the script never prints it.

Related artifacts:

- [`scripts/verify-onchain-proof.mjs`](../scripts/verify-onchain-proof.mjs)
- [`evidence/onchain/verified-transactions.json`](../evidence/onchain/verified-transactions.json)
- [`evidence/onchain/VERIFICATION_LOG.md`](../evidence/onchain/VERIFICATION_LOG.md)

The evidence files are normalized audit records, not falsely labeled raw API dumps. The original transient Redeem failure payload was not preserved, so the repository states that limitation explicitly.

## What the chain proves

For the Redeem transaction, the on-chain record proves that:

- the transaction exists on Nile Testnet;
- it was included in block `71382254`;
- the contract execution completed successfully;
- the jTRX Redeem call was executed against the configured JustLend jTRX contract;
- a valid wallet authorization existed for the transaction;
- the transaction consumed an observed fee of 7.5699 TRX.

The chain **does not** prove which physical person clicked the wallet's Sign button. TRON Compass therefore describes this as a transaction **authorized through the connected TronLink wallet**, not as proof of a particular human actor.

## Verification flow

```text
User review
   ↓
TronLink authorization
   ↓
Nile transaction broadcast
   ↓
Transaction hash
   ↓
TronGrid / chain receipt
   ↓
Block inclusion + explicit SUCCESS
   ↓
TRON Compass = CONFIRMED
```

A transaction hash by itself is not treated as success.

The transaction path is implemented in
[`src/lib/tron/transaction.ts`](../src/lib/tron/transaction.ts).

## Chain-truth reconciliation

During final QA, the Redeem transaction above exposed an important reliability case:

1. the application initially persisted a local `FAILED / REVERT` observation;
2. the same transaction hash was later verified on Nile as block-included and `SUCCESS`;
3. the persisted Decision Receipt was reconciled to `CONFIRMED`;
4. the earlier failed observation was preserved in the technical audit history instead of being silently erased;
5. a confirmed chain success is terminal and is not downgraded by a later timeout or a single inconsistent response.

This behavior is implemented in
[`src/domain/decision/transaction-reconciliation.ts`](../src/domain/decision/transaction-reconciliation.ts)
and covered by
[`tests/transaction-reconciliation.test.ts`](../tests/transaction-reconciliation.test.ts).

## What is intentionally off-chain

The **Decision Receipt itself is not written on-chain**.

It is browser-local and contains the user's confirmed rules, frozen evidence, considered plans, assumptions, approval details, execution state, stops, and later reviews. A deterministic SHA-256 protects the pre-execution decision snapshot from accidental mutation, while the real transaction hash links the decision record to verifiable chain execution.

This design avoids publishing private planning context on a public chain while keeping the execution independently verifiable.

## Reality labels

TRON Compass separates different kinds of evidence:

- **LIVE MAINNET** — current JustLend / USDD market evidence used for planning.
- **NILE LIVE** — real Nile wallet, contract, and transaction observations.
- **SNAPSHOT** — evidence frozen into a Decision Receipt.
- **SIMULATED** — replay / scenario analysis; never presented as an observed chain outcome.
- **USER DECLARED** — hypothetical planning quantities supplied by the user.

Mainnet is read-only. Real execution is restricted to Nile Testnet.

## Final P0 status

At the final P0 checkpoint:

- the same Redeem transaction remained `CONFIRMED` after application reload;
- its transaction hash and chain result were preserved in the same Decision Receipt;
- no duplicate receipt was created by reconciliation;
- the audit history retained both the earlier local failure observation and the later authoritative success;
- the deterministic test suite passed 155/155 twice;
- lint, typecheck, and production build passed.

**P0: COMPLETE · FEATURE FREEZE: YES**
