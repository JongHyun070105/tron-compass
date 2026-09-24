export const USDD_FALLBACK_FIXTURE = {
  overview: {
    totalSupplyValue: "1532337561.56",
    totalCollateralValue: "2266244264.79",
    collateralRatio: "147.89%",
    earnTvl: "207931607.42",
    earnSa: "29625951.39",
    source: "https://app-api.usdd.io/data-platform/overview/info",
  },
  psm: {
    name: "TRON PSM (Peg Stability Module)",
    swapPair: "USDD <-> USDT",
    fee: "0.00%",
    status: "ACTIVE",
    psmContract: "TUajR7CbXU6hX8n3XtNkitFAD25JvP99K6",
  },
  vaults: [
    {
      vaultType: "TRX-A",
      lockedValueUsd: "$426.28M",
      mintedUsdd: "170.64M",
      collateralRatio: "249.18%",
      minRatio: "120%",
    },
    {
      vaultType: "TRX-B",
      lockedValueUsd: "$245.30M",
      mintedUsdd: "95.21M",
      collateralRatio: "256.13%",
      minRatio: "117%",
    },
  ],
};
