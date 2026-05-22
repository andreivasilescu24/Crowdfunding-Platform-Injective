// Minimal Keplr integration for Injective Mainnet.
// In a fully real-money flow you'd also wire up CosmJS signing clients,
// but for connect-and-identify this is all you need.

export const INJECTIVE_CHAIN_ID = "injective-1";

type KeplrAccount = { address: string; pubKey: Uint8Array; algo: string };

type Keplr = {
  enable: (chainId: string) => Promise<void>;
  getKey: (chainId: string) => Promise<KeplrAccount>;
};

declare global {
  interface Window {
    keplr?: Keplr;
  }
}

export async function connectKeplr(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Window unavailable");
  const keplr = window.keplr;
  if (!keplr) {
    throw new Error(
      "Keplr extension not found. Install it from https://www.keplr.app/",
    );
  }
  await keplr.enable(INJECTIVE_CHAIN_ID);
  const key = await keplr.getKey(INJECTIVE_CHAIN_ID);
  return key.address;
}
