// Real Injective CosmWasm client. Queries and executes both go through
// gRPC-web; executes are signed by Keplr (signDirect) and broadcast via
// TxGrpcApi. The REST endpoint (testnet.sentry.lcd.injective.network)
// returns duplicated CORS headers, so we avoid it entirely.
//
// Spec mapping (kept 1:1 with contract/crowdfunding/src/msg.rs):
//   create(...)                → ExecuteMsg::CreateCampaign
//   donate(campaignId, amount) → ExecuteMsg::Donate
//   claim(campaignId)          → ExecuteMsg::Claim
//   refund(campaignId)         → ExecuteMsg::Refund
//   getCampaign(id)            → QueryMsg::GetCampaign
//   getContribution(id, addr)  → QueryMsg::GetContribution
//   getAllCampaigns()          → QueryMsg::GetAllCampaigns

import {
  ChainGrpcAuthApi,
  ChainGrpcTendermintApi,
  ChainGrpcWasmApi,
  MsgExecuteContract,
  TxGrpcApi,
  createTransaction,
  toUtf8,
} from "@injectivelabs/sdk-ts";
import { DEFAULT_BLOCK_TIMEOUT_HEIGHT, getStdFee } from "@injectivelabs/utils";
import Long from "long";

import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  ENDPOINTS,
  INJ_DENOM,
  assertContractConfigured,
} from "./network";
import { baseToInj, injToBase } from "./inj";
import type { Campaign } from "./types";

// Mirrors the CampaignResponse struct in contract/crowdfunding/src/msg.rs.
// We don't currently read `status` — the UI derives it from deadline + raised
// vs goal — so we leave it off the type. Add it back if a consumer needs it.
type ContractCampaign = {
  id: number;
  creator: string;
  title: string;
  description: string;
  goal: string;
  deadline: number;
  current_amount: string;
  claimed: boolean;
};

type CampaignListResponse = { campaigns: ContractCampaign[] };
type ContributionResponse = { amount: string };

const wasmApi = new ChainGrpcWasmApi(ENDPOINTS.grpc);
const authApi = new ChainGrpcAuthApi(ENDPOINTS.grpc);
const tmApi = new ChainGrpcTendermintApi(ENDPOINTS.grpc);
const txApi = new TxGrpcApi(ENDPOINTS.grpc);

function toCampaign(c: ContractCampaign): Campaign {
  return {
    id: c.id,
    creator: c.creator,
    title: c.title,
    description: c.description,
    goalInj: baseToInj(c.goal),
    raisedInj: baseToInj(c.current_amount),
    deadline: c.deadline,
    withdrawn: c.claimed,
  };
}

async function querySmart<T>(msg: object): Promise<T> {
  assertContractConfigured();
  const res = await wasmApi.fetchSmartContractState(CONTRACT_ADDRESS, msg);
  return JSON.parse(toUtf8(res.data)) as T;
}

async function signAndBroadcast(
  sender: string,
  msg: object,
  funds?: { denom: string; amount: string },
): Promise<string> {
  assertContractConfigured();
  if (typeof window === "undefined") throw new Error("Window unavailable");
  const keplr = window.keplr;
  if (!keplr) throw new Error("Keplr not found");

  await keplr.enable(CHAIN_ID);
  const key = await keplr.getKey(CHAIN_ID);
  if (key.bech32Address !== sender) {
    throw new Error(
      `Connected wallet (${key.bech32Address}) doesn't match the sender (${sender}).`,
    );
  }
  const pubKey = Buffer.from(key.pubKey).toString("base64");

  const account = await authApi.fetchAccount(sender);
  const accountNumber = account.baseAccount.accountNumber;
  const sequence = account.baseAccount.sequence;

  const latestBlock = (await tmApi.fetchLatestBlock()) as
    | { header?: { height?: number | string } }
    | undefined;
  const rawHeight = latestBlock?.header?.height;
  if (rawHeight == null) {
    throw new Error("Could not fetch latest block height from chain.");
  }
  const timeoutHeight = Number(rawHeight) + Number(DEFAULT_BLOCK_TIMEOUT_HEIGHT);

  const execMsg = MsgExecuteContract.fromJSON({
    sender,
    contractAddress: CONTRACT_ADDRESS,
    msg,
    funds: funds ? [funds] : undefined,
  });

  const { txRaw, signDoc } = createTransaction({
    pubKey,
    chainId: CHAIN_ID,
    fee: getStdFee({ gas: "1000000" }),
    message: execMsg,
    sequence,
    timeoutHeight,
    accountNumber,
  });

  const directSignResponse = await keplr.signDirect(CHAIN_ID, sender, {
    bodyBytes: signDoc.bodyBytes,
    authInfoBytes: signDoc.authInfoBytes,
    chainId: CHAIN_ID,
    accountNumber: Long.fromNumber(accountNumber),
  });

  // Keplr may modify the fee before signing, so we must broadcast the bytes
  // it actually signed — not our pre-sign txRaw.
  txRaw.bodyBytes = directSignResponse.signed.bodyBytes;
  txRaw.authInfoBytes = directSignResponse.signed.authInfoBytes;
  txRaw.signatures = [
    Uint8Array.from(Buffer.from(directSignResponse.signature.signature, "base64")),
  ];

  const txResponse = await txApi.broadcast(txRaw);

  if (txResponse.code !== 0) {
    throw new Error(`Tx failed (code ${txResponse.code}): ${txResponse.rawLog}`);
  }
  return txResponse.txHash;
}

export const contract = {
  // --- queries -------------------------------------------------------------
  async getAllCampaigns(): Promise<Campaign[]> {
    // Paginate: the contract caps to MAX_LIMIT=30 per page.
    const all: ContractCampaign[] = [];
    let startAfter: number | null = null;
    for (;;) {
      const resp: CampaignListResponse = await querySmart<CampaignListResponse>({
        get_all_campaigns: { start_after: startAfter, limit: 30 },
      });
      const page: ContractCampaign[] = resp.campaigns ?? [];
      all.push(...page);
      if (page.length < 30) break;
      startAfter = page[page.length - 1].id;
    }
    return all.map(toCampaign);
  },

  async getCampaign(id: number): Promise<Campaign | undefined> {
    try {
      const resp = await querySmart<ContractCampaign>({ get_campaign: { campaign_id: id } });
      return toCampaign(resp);
    } catch (e) {
      // Only treat "not found" as undefined; let other errors surface.
      const msg = e instanceof Error ? e.message : String(e);
      if (/not\s*found/i.test(msg) || /type:\s*crowdfunding::state::Campaign/i.test(msg)) {
        return undefined;
      }
      throw e;
    }
  },

  async getContribution(campaignId: number, donor: string): Promise<string> {
    const resp = await querySmart<ContributionResponse>({
      get_contribution: { campaign_id: campaignId, contributor: donor },
    });
    return baseToInj(resp.amount);
  },

  // --- executes ------------------------------------------------------------
  async create(input: {
    creator: string;
    title: string;
    description: string;
    goalInj: string;
    durationSec: number;
  }): Promise<void> {
    const deadline = Math.floor(Date.now() / 1000) + input.durationSec;
    await signAndBroadcast(input.creator, {
      create_campaign: {
        title: input.title.trim(),
        description: input.description.trim(),
        goal: injToBase(input.goalInj),
        deadline,
      },
    });
  },

  async donate(campaignId: number, donor: string, amountInj: string): Promise<void> {
    await signAndBroadcast(
      donor,
      { donate: { campaign_id: campaignId } },
      { denom: INJ_DENOM, amount: injToBase(amountInj) },
    );
  },

  async claim(campaignId: number, sender: string): Promise<void> {
    await signAndBroadcast(sender, { claim: { campaign_id: campaignId } });
  },

  async refund(campaignId: number, donor: string): Promise<string> {
    const prior = await contract.getContribution(campaignId, donor);
    await signAndBroadcast(donor, { refund: { campaign_id: campaignId } });
    return prior;
  },
};

