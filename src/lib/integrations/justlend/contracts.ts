export interface ContractAddressInfo {
  base58: string;
  symbol: string;
  decimals: number;
  underlyingSymbol?: string;
  underlyingAddress?: string;
  underlyingDecimals?: number;
  status: "active" | "legacy" | "paused";
}

export const JUSTLEND_MAINNET_CONTRACTS = {
  comptroller: "TGjYzgCyPobsNS9n6WcbdLVR9dH7mWqFx7",
  priceOracle: "TGnYnSn4G9PgWFj7QQemh4YMZKp3fkympJ",
  usddToken: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
  usdtToken: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  jTokens: {
    jTRX: {
      base58: "TE2RzoSV3wFK99w6J9UnnZ4vLfXYoxvRwP",
      symbol: "jTRX",
      decimals: 8,
      underlyingSymbol: "TRX",
      underlyingAddress: "",
      underlyingDecimals: 6,
      status: "active",
    },
    jUSDD: {
      base58: "TKFRELGGoRgiayhwJTNNLqCNjFoLBh3Mnf",
      symbol: "jUSDD",
      decimals: 8,
      underlyingSymbol: "USDD",
      underlyingAddress: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
      underlyingDecimals: 18,
      status: "active",
    },
    jUSDT: {
      base58: "TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd",
      symbol: "jUSDT",
      decimals: 8,
      underlyingSymbol: "USDT",
      underlyingAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      underlyingDecimals: 6,
      status: "active",
    },
  } as Record<string, ContractAddressInfo>,
};

export const JUSTLEND_NILE_CONTRACTS = {
  comptroller: "TJUCStq3WqfKqZLuZje5v7z6Ua6iBry1P6",
  jTokens: {
    jTRX: {
      base58: "TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq",
      symbol: "jTRX",
      decimals: 8,
      underlyingSymbol: "TRX",
      underlyingAddress: "",
      underlyingDecimals: 6,
      status: "active",
    },
    jUSDT: {
      base58: "TT6Qk1qrBM4MgyskYZx5pjeJjvv3fdL2ih",
      symbol: "jUSDT",
      decimals: 8,
      underlyingSymbol: "USDT",
      underlyingAddress: "TPYwAC9Y4uUcT2QH3WPPjqxzJSJWymMoMS",
      underlyingDecimals: 6,
      status: "active",
    },
    jUSDD: {
      base58: "TBqtwZhjP49heKsoTHeX5MhKBJMmyuP88b",
      symbol: "jUSDD",
      decimals: 8,
      underlyingSymbol: "USDD",
      underlyingAddress: "TZ78R2E6ejfFhxq8hxrmuqT6hGBxjHQbo4",
      underlyingDecimals: 18,
      status: "active",
    },
  } as Record<string, ContractAddressInfo>,
};

/**
 * jTRX (native TRX) uses a payable mint() function where TRX amount is sent in msg.value (sun).
 */
export const JTRX_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "redeem",
    inputs: [{ type: "uint256", name: "redeemTokens" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "redeemUnderlying",
    inputs: [{ type: "uint256", name: "redeemAmount" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address", name: "owner" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "exchangeRateStored",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
];
