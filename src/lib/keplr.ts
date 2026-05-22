import type { ChainInfo, Keplr } from "@keplr-wallet/types";
import { CHAIN_ID, ENDPOINTS, IS_TESTNET } from "./network";

declare global {
  interface Window {
    keplr?: Keplr;
  }
}

export async function connectKeplr(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Window unavailable");
  const keplr = window.keplr;
  if (!keplr) {
    throw new Error("Keplr extension not found. Install it from https://www.keplr.app/");
  }

  try {
    await keplr.enable(CHAIN_ID);
  } catch {
    if (IS_TESTNET) {
      await keplr.experimentalSuggestChain(injectiveTestnetChainInfo());
      await keplr.enable(CHAIN_ID);
    } else {
      throw new Error(`Could not enable chain ${CHAIN_ID} in Keplr.`);
    }
  }

  const key = await keplr.getKey(CHAIN_ID);
  return key.bech32Address;
}

function injectiveTestnetChainInfo(): ChainInfo {
  const { rpc, rest } = ENDPOINTS;
  if (!rpc || !rest) {
    throw new Error(`Network endpoints missing rpc/rest for ${CHAIN_ID}.`);
  }
  const currency = {
    coinDenom: "INJ",
    coinMinimalDenom: "inj",
    coinDecimals: 18,
    coinGeckoId: "injective-protocol",
  };
  return {
    chainId: CHAIN_ID,
    chainName: "Injective Testnet",
    rpc,
    rest,
    bip44: { coinType: 60 },
    bech32Config: {
      bech32PrefixAccAddr: "inj",
      bech32PrefixAccPub: "injpub",
      bech32PrefixValAddr: "injvaloper",
      bech32PrefixValPub: "injvaloperpub",
      bech32PrefixConsAddr: "injvalcons",
      bech32PrefixConsPub: "injvalconspub",
    },
    currencies: [currency],
    feeCurrencies: [
      {
        ...currency,
        gasPriceStep: { low: 500_000_000, average: 700_000_000, high: 900_000_000 },
      },
    ],
    stakeCurrency: currency,
    features: ["eth-address-gen", "eth-key-sign"],
  };
}
