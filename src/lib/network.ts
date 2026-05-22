import { Network, getNetworkEndpoints, type NetworkEndpoints } from "@injectivelabs/networks";
import { ChainId } from "@injectivelabs/ts-types";

type NetworkName = "mainnet" | "testnet";

const rawNetwork = process.env.NEXT_PUBLIC_NETWORK ?? "testnet";
if (rawNetwork !== "mainnet" && rawNetwork !== "testnet") {
  throw new Error(
    `NEXT_PUBLIC_NETWORK must be "mainnet" or "testnet", got "${rawNetwork}".`,
  );
}
const networkName: NetworkName = rawNetwork;

export const IS_TESTNET = networkName === "testnet";
export const NETWORK: Network = IS_TESTNET ? Network.TestnetSentry : Network.MainnetSentry;
export const CHAIN_ID: ChainId = IS_TESTNET ? ChainId.Testnet : ChainId.Mainnet;
export const ENDPOINTS: NetworkEndpoints = getNetworkEndpoints(NETWORK);

export const INJ_DENOM = "inj";
export const INJ_DECIMALS = 18;

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").trim();

export function assertContractConfigured(): void {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS is not set. Deploy the contract and set the env var in .env.local.",
    );
  }
}
