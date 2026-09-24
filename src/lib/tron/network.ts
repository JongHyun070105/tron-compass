export interface TronNetworkConfig {
  id: "mainnet" | "nile";
  name: string;
  chainId: string;
  fullNode: string;
  solidityNode: string;
  eventServer: string;
  explorer: string;
  isTestnet: boolean;
}

export const TRON_NETWORKS: Record<string, TronNetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "TRON Mainnet",
    chainId: "0x2b6653dc",
    fullNode: "https://api.trongrid.io",
    solidityNode: "https://api.trongrid.io",
    eventServer: "https://api.trongrid.io",
    explorer: "https://tronscan.org",
    isTestnet: false,
  },
  nile: {
    id: "nile",
    name: "Nile Testnet",
    chainId: "0xcd8690",
    fullNode: "https://nile.trongrid.io",
    solidityNode: "https://nile.trongrid.io",
    eventServer: "https://nile.trongrid.io",
    explorer: "https://nile.tronscan.org",
    isTestnet: true,
  },
};

export const DEFAULT_NETWORK = TRON_NETWORKS.nile;
