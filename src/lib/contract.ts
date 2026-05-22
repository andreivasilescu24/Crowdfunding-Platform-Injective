// Mock contract client.
//
// In a real deployment, replace these implementations with calls to the
// CosmWasm contract on Injective (via CosmJS / InjectiveLabs SDK). The shape
// of each function maps 1:1 to the spec:
//
//   create(...)                      → ExecuteMsg::Create
//   donate(campaignId, amount)       → ExecuteMsg::Donate { campaign_id }
//   claim(campaignId)                → ExecuteMsg::Claim  { campaign_id }
//   refund(campaignId)               → ExecuteMsg::Refund { campaign_id }
//   getCampaign(id)                  → QueryMsg::GetCampaign
//   getContribution(id, addr)        → QueryMsg::GetContribution
//   getAllCampaigns()                → QueryMsg::GetAllCampaigns

import type { Campaign, Contribution } from "./types";

const LS_CAMPAIGNS = "cf.campaigns.v1";
const LS_CONTRIBS = "cf.contribs.v1";

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function seedIfEmpty() {
  const existing = load<Campaign[]>(LS_CAMPAIGNS, []);
  if (existing.length > 0) return;
  const now = Math.floor(Date.now() / 1000);
  const seed: Campaign[] = [
    {
      id: 1,
      creator: "inj1demo0creator0addressxxxxxxxxxxxxxxxxx",
      title: "Open-source SIP routing toolkit",
      description:
        "Funding maintainers to release a polished, audited toolkit for SIP routing experimentation on OpenSIPs and Kamailio.",
      goalInj: "120",
      raisedInj: "47.5",
      deadline: now + 60 * 60 * 24 * 12,
      withdrawn: false,
    },
    {
      id: 2,
      creator: "inj1demo0creator0addressxxxxxxxxxxxxxxxxx",
      title: "Community node operator grants",
      description:
        "Microgrants to bootstrap validator and IBC relayer operators in underrepresented regions.",
      goalInj: "300",
      raisedInj: "312.4",
      deadline: now - 60 * 60 * 24 * 2,
      withdrawn: false,
    },
    {
      id: 3,
      creator: "inj1otherxcreatorxxxxxxxxxxxxxxxxxxxxxxxxx",
      title: "DeFi safety analyzer",
      description:
        "A static-analysis tool that flags risky CosmWasm patterns in audited contracts.",
      goalInj: "80",
      raisedInj: "12",
      deadline: now - 60 * 60 * 24 * 1,
      withdrawn: false,
    },
  ];
  save(LS_CAMPAIGNS, seed);
}

function nextId(campaigns: Campaign[]): number {
  return campaigns.reduce((m, c) => Math.max(m, c.id), 0) + 1;
}

function addDecimals(a: string, b: string): string {
  return (parseFloat(a || "0") + parseFloat(b || "0")).toString();
}

function subDecimals(a: string, b: string): string {
  return (parseFloat(a || "0") - parseFloat(b || "0")).toString();
}

// Simulate a signed transaction so the UI feels real.
async function fakeTx<T>(work: () => T): Promise<T> {
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
  return work();
}

export const contract = {
  // --- queries -------------------------------------------------------------
  async getAllCampaigns(): Promise<Campaign[]> {
    seedIfEmpty();
    return load<Campaign[]>(LS_CAMPAIGNS, []);
  },

  async getCampaign(id: number): Promise<Campaign | undefined> {
    const list = await contract.getAllCampaigns();
    return list.find((c) => c.id === id);
  },

  async getContribution(campaignId: number, donor: string): Promise<string> {
    const list = load<Contribution[]>(LS_CONTRIBS, []);
    const row = list.find((c) => c.campaignId === campaignId && c.donor === donor);
    return row?.amountInj ?? "0";
  },

  async getContributionsFor(donor: string): Promise<Contribution[]> {
    const list = load<Contribution[]>(LS_CONTRIBS, []);
    return list.filter((c) => c.donor === donor && parseFloat(c.amountInj) > 0);
  },

  // --- executes ------------------------------------------------------------
  async create(input: {
    creator: string;
    title: string;
    description: string;
    goalInj: string;
    durationSec: number;
  }): Promise<Campaign> {
    return fakeTx(() => {
      const list = load<Campaign[]>(LS_CAMPAIGNS, []);
      const c: Campaign = {
        id: nextId(list),
        creator: input.creator,
        title: input.title.trim(),
        description: input.description.trim(),
        goalInj: input.goalInj,
        raisedInj: "0",
        deadline: Math.floor(Date.now() / 1000) + input.durationSec,
        withdrawn: false,
      };
      save(LS_CAMPAIGNS, [c, ...list]);
      return c;
    });
  },

  async donate(campaignId: number, donor: string, amountInj: string): Promise<void> {
    return fakeTx(() => {
      const campaigns = load<Campaign[]>(LS_CAMPAIGNS, []);
      const idx = campaigns.findIndex((c) => c.id === campaignId);
      if (idx === -1) throw new Error("Campaign not found");
      const c = campaigns[idx];
      if (Math.floor(Date.now() / 1000) >= c.deadline)
        throw new Error("Campaign deadline has passed");
      c.raisedInj = addDecimals(c.raisedInj, amountInj);
      campaigns[idx] = c;
      save(LS_CAMPAIGNS, campaigns);

      const contribs = load<Contribution[]>(LS_CONTRIBS, []);
      const cIdx = contribs.findIndex(
        (x) => x.campaignId === campaignId && x.donor === donor,
      );
      if (cIdx === -1) {
        contribs.push({ campaignId, donor, amountInj });
      } else {
        contribs[cIdx].amountInj = addDecimals(contribs[cIdx].amountInj, amountInj);
      }
      save(LS_CONTRIBS, contribs);
    });
  },

  async claim(campaignId: number, sender: string): Promise<void> {
    return fakeTx(() => {
      const campaigns = load<Campaign[]>(LS_CAMPAIGNS, []);
      const idx = campaigns.findIndex((c) => c.id === campaignId);
      if (idx === -1) throw new Error("Campaign not found");
      const c = campaigns[idx];
      if (c.creator !== sender) throw new Error("Only the creator can claim");
      if (Math.floor(Date.now() / 1000) < c.deadline)
        throw new Error("Deadline has not passed yet");
      if (parseFloat(c.raisedInj) < parseFloat(c.goalInj))
        throw new Error("Goal not reached");
      if (c.withdrawn) throw new Error("Funds already withdrawn");
      c.withdrawn = true;
      campaigns[idx] = c;
      save(LS_CAMPAIGNS, campaigns);
    });
  },

  async refund(campaignId: number, donor: string): Promise<string> {
    return fakeTx(() => {
      const campaigns = load<Campaign[]>(LS_CAMPAIGNS, []);
      const idx = campaigns.findIndex((c) => c.id === campaignId);
      if (idx === -1) throw new Error("Campaign not found");
      const c = campaigns[idx];
      if (Math.floor(Date.now() / 1000) < c.deadline)
        throw new Error("Deadline has not passed yet");
      if (parseFloat(c.raisedInj) >= parseFloat(c.goalInj))
        throw new Error("Goal was reached — refunds are not available");

      const contribs = load<Contribution[]>(LS_CONTRIBS, []);
      const cIdx = contribs.findIndex(
        (x) => x.campaignId === campaignId && x.donor === donor,
      );
      if (cIdx === -1 || parseFloat(contribs[cIdx].amountInj) <= 0)
        throw new Error("No contribution to refund");

      const refundAmount = contribs[cIdx].amountInj;
      c.raisedInj = subDecimals(c.raisedInj, refundAmount);
      contribs[cIdx].amountInj = "0";
      campaigns[idx] = c;
      save(LS_CAMPAIGNS, campaigns);
      save(LS_CONTRIBS, contribs);
      return refundAmount;
    });
  },
};
