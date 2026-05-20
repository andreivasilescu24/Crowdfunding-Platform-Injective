"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { contract } from "@/lib/contract";
import type { Campaign } from "@/lib/types";
import { CampaignCard } from "./CampaignCard";
import { CreateCampaignForm } from "./CreateCampaignForm";
import { useWallet } from "./WalletProvider";

type Filter = "all" | "active" | "ended" | "mine";

export function Dashboard() {
  const { address } = useWallet();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await contract.getAllCampaigns();
      setCampaigns(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // re-render countdowns once per minute
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return campaigns.filter((c) => {
      if (filter === "active") return now < c.deadline;
      if (filter === "ended") return now >= c.deadline;
      if (filter === "mine") return !!address && c.creator === address;
      return true;
    });
  }, [campaigns, filter, address, tick]);

  const stats = useMemo(() => {
    const total = campaigns.length;
    const totalRaised = campaigns.reduce((s, c) => s + parseFloat(c.raisedInj || "0"), 0);
    const now = Math.floor(Date.now() / 1000);
    const active = campaigns.filter((c) => now < c.deadline).length;
    return { total, totalRaised, active };
  }, [campaigns, tick]);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Campaigns" value={String(stats.total)} />
        <StatCard label="Active" value={String(stats.active)} />
        <StatCard
          label="Total raised"
          value={`${stats.totalRaised.toLocaleString(undefined, { maximumFractionDigits: 2 })} INJ`}
        />
      </section>

      <CreateCampaignForm onCreated={refresh} />

      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-xl font-semibold">Campaigns</h2>
          <div className="flex items-center gap-1 p-1 bg-panel border border-edge rounded-xl">
            {(["all", "active", "ended", "mine"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm rounded-lg capitalize transition-colors ${
                  filter === f ? "bg-edge text-white" : "text-white/60 hover:text-white"
                }`}
                disabled={f === "mine" && !address}
                title={f === "mine" && !address ? "Connect wallet" : undefined}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="card p-10 text-center text-white/50">Loading campaigns…</div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-white/50">No campaigns to show.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((c) => (
              <CampaignCard key={c.id} campaign={c} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
