type TronLinkEvent = "accountsChanged" | "chainChanged" | "connect" | "disconnect";
type TronLinkListener = (...args: any[]) => void;

export interface TronLinkProvider {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  tronWeb?: any | false;
  on?: (event: string, listener: TronLinkListener) => unknown;
  removeListener?: (event: string, listener: TronLinkListener) => unknown;
}

export interface TronLinkEventHandlers {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chain: { chainId?: string }) => void;
  onConnect: (chain?: { chainId?: string }) => void;
  onDisconnect: () => void;
}

interface TronWindow extends Window {
  tron?: TronLinkProvider;
  tronLink?: TronLinkProvider;
  tronWeb?: any;
}

export function getTronLinkProvider(): TronLinkProvider | null {
  if (typeof window === "undefined") return null;
  const tronWindow = window as TronWindow;
  if (tronWindow.tron?.request) return tronWindow.tron;
  if (tronWindow.tronLink?.request) return tronWindow.tronLink;
  return null;
}

export function getWalletTronWeb(provider = getTronLinkProvider()): any | null {
  // TronLink uses `false` to indicate that its injected provider is present but
  // not yet authorized/ready. Do not accidentally pick up a stale global
  // TronWeb instance from a prior injection in that state.
  if (provider?.tronWeb === false) return null;
  if (provider?.tronWeb) return provider.tronWeb;
  if (typeof window === "undefined") return null;
  const tronWindow = window as TronWindow;
  return tronWindow.tronWeb || null;
}

export async function requestTronLinkAccount(): Promise<string | null> {
  const provider = getTronLinkProvider();
  if (!provider?.request) return null;

  const modernProvider = typeof window !== "undefined" && provider === (window as TronWindow).tron;
  const response = await provider.request({
    method: modernProvider ? "eth_requestAccounts" : "tron_requestAccounts",
  });
  if (Array.isArray(response) && typeof response[0] === "string") return response[0];

  const data = response && typeof response === "object"
    ? (response as { data?: { address?: unknown; addressList?: unknown }; code?: number })
    : null;
  if (data?.code !== undefined && data.code !== 200) return null;
  if (typeof data?.data?.address === "string") return data.data.address;
  if (Array.isArray(data?.data?.addressList) && typeof data.data.addressList[0] === "string") {
    return data.data.addressList[0];
  }
  return getWalletTronWeb(provider)?.defaultAddress?.base58 ?? null;
}

export function subscribeToTronLinkEvents(
  provider: TronLinkProvider | null,
  handlers: TronLinkEventHandlers
): () => void {
  const events: Array<[TronLinkEvent, TronLinkListener]> = [
    ["accountsChanged", (accounts: unknown) => handlers.onAccountsChanged(Array.isArray(accounts) ? accounts.filter((item): item is string => typeof item === "string") : [])],
    ["chainChanged", (chain: unknown) => handlers.onChainChanged(chain && typeof chain === "object" ? chain as { chainId?: string } : {})],
    ["connect", (chain: unknown) => handlers.onConnect(chain && typeof chain === "object" ? chain as { chainId?: string } : {})],
    ["disconnect", handlers.onDisconnect],
  ];

  if (provider?.on) {
    for (const [event, listener] of events) provider.on(event, listener);
    return () => {
      for (const [event, listener] of events) provider.removeListener?.(event, listener);
    };
  }

  // Compatibility for the current legacy TronLink injection only. The modern
  // provider path above uses the documented event emitter API.
  if (typeof window === "undefined" || !provider) return () => undefined;
  const onLegacyMessage = (event: MessageEvent) => {
    const message = event.data?.message;
    if (!message || typeof message.action !== "string") return;
    if (message.action === "setAccount") {
      const address = message.data?.address;
      handlers.onAccountsChanged(typeof address === "string" && address ? [address] : []);
    } else if (message.action === "setNode") {
      handlers.onChainChanged({});
    } else if (message.action === "acceptWeb" || message.action === "connectWeb") {
      handlers.onConnect({});
    } else if (message.action === "disconnectWeb") {
      handlers.onDisconnect();
    }
  };
  window.addEventListener("message", onLegacyMessage);
  return () => window.removeEventListener("message", onLegacyMessage);
}
