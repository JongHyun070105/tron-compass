# Normalized on-chain verification log

This file records the final normalized observations used for the submission. It is **not** a preserved raw TronGrid response.

For reproducible live verification, run:

```bash
pnpm verify:onchain
```

The verifier is read-only. It never signs or broadcasts a transaction.

## Flow: Redeem

```text
network=TRON_NILE
flow=redeem
txHash=4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286
blockNumber=71382254
result=SUCCESS
status=CONFIRMED
amount=100 jTRX
returned=1.117763 TRX
actualFee=7.5699 TRX
```

Explorer:
https://nile.tronscan.org/transaction/4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286/overview

## Flow: Supply

```text
network=TRON_NILE
flow=supply
txHash=855416e66dc73f0909cb822b28ec64a3a0e9c7b69c7580cb98c70e1971a1b41c
blockNumber=71376676
result=SUCCESS
status=CONFIRMED
amount=985 TRX
minted=88122.39013208 jTRX
actualFee=6.5894 TRX
```

Explorer:
https://nile.tronscan.org/transaction/855416e66dc73f0909cb822b28ec64a3a0e9c7b69c7580cb98c70e1971a1b41c

## Important limitation

The first transient `FAILED / REVERT` observation from the Redeem QA incident was not preserved as a raw HTTP response, so this repository does not claim to contain that raw payload. The Decision Receipt audit history preserves the state transition, and current chain truth is independently reproducible with the verifier above.
