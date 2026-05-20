"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/types";
import { fmtCountdown, fmtInj, pct, shortAddr } from "@/lib/format";
import { useWallet } from "./WalletProvider";
import { contract } from "@/lib/contract";

type Props = {
  campaign: Campaign;
  onChanged: () => void;
};

export function CampaignCard({ campaign, onChanged }: Props) {
  const { address } = useWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<null | "donate" | "claim" | "refund">(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [myContribution, setMyContribution] = useState("0");

  useEffect(() => {
    if (!address) {
      setMyContribution("0");
      return;
    }
    contract.getContribution(campaign.id, address).then(setMyContribution);
  }, [address, campaign.id, campaign.raisedInj]);

  const now = Math.floor(Date.now() / 1000);
  const ended = now >= campaign.deadline;
  const goalReached = parseFloat(campaign.raisedInj) >= parseFloat(campaign.goalInj);

  const isCreator = !!address && address === campaign.creator;
  const canClaim = isCreator && ended && goalReached && !campaign.withdrawn;
  const canRefund =
    !!address && ended && !goalReached && parseFloat(myContribution) > 0;
  const canDonate = !!address && !ended;

  async function handleDonate() {
    if (!address) return;
    setErr(null);
    setOk(null);
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      setErr("Enter a positive INJ amount");
      return;
    }
    try {
      setBusy("donate");
      await contract.donate(campaign.id, address, amount);
      setOk(`Donated ${fmtInj(amount)}. Tx signed.`);
      setAmount("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Donation failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleClaim() {
    if (!address) return;
    setErr(null);
    setOk(null);
    try {
      setBusy("claim");
      await contract.claim(campaign.id, address);
      setOk("Funds claimed.");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRefund() {
    if (!address) return;
    setErr(null);
    setOk(null);
    try {
      setBusy("refund");
      const refunded = await contract.refund(campaign.id, address);
      setOk(`Refunded ${fmtInj(refunded)}.`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setBusy(null);
    }
  }

  const progress = pct(campaign.raisedInj, campaign.goalInj);

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip font-mono text-white/60">#{campaign.id}</span>
            {ended ? (
              goalReached ? (
                <span className="chip text-good border-good/40">Goal reached</span>
              ) : (
                <span className="chip text-warn border-warn/40">Refundable</span>
              )
            ) : (
              <span className="chip text-accent border-accent/40">Active</span>
            )}
            {campaign.withdrawn && <span className="chip text-white/50">Withdrawn</span>}
            {isCreator && <span className="chip text-accent2 border-accent2/40">You created</span>}
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-tight">{campaign.title}</h3>
          <p className="mt-1 text-sm text-white/60">{campaign.description}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-white/40">{fmtCountdown(campaign.deadline)}</div>
          <div className="text-xs text-white/40 mt-1 font-mono">
            by {shortAddr(campaign.creator)}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-sm">
            <span className="font-semibold">{fmtInj(campaign.raisedInj)}</span>
            <span className="text-white/40"> of {fmtInj(campaign.goalInj)}</span>
          </div>
          <div className="text-xs text-white/50">{progress.toFixed(1)}%</div>
        </div>
        <div className="h-2 rounded-full bg-edge overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent2"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {address && parseFloat(myContribution) > 0 && (
        <div className="text-xs text-white/50">
          Your contribution: <span className="text-white/80">{fmtInj(myContribution)}</span>
        </div>
      )}

      {canDonate && (
        <div className="flex items-center gap-2">
          <input
            className="input"
            type="number"
            min="0"
            step="0.0001"
            placeholder="Amount in INJ"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy !== null}
          />
          <button
            className="btn-primary"
            onClick={handleDonate}
            disabled={busy !== null}
          >
            {busy === "donate" ? "Signing…" : "Donate"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {canClaim && (
          <button className="btn-secondary" onClick={handleClaim} disabled={busy !== null}>
            {busy === "claim" ? "Signing…" : "Claim funds"}
          </button>
        )}
        {canRefund && (
          <button className="btn-secondary" onClick={handleRefund} disabled={busy !== null}>
            {busy === "refund" ? "Signing…" : "Refund my donation"}
          </button>
        )}
        {!address && (
          <span className="text-xs text-white/40">Connect Keplr to interact</span>
        )}
        {address && !canDonate && !canClaim && !canRefund && (
          <span className="text-xs text-white/40">
            {ended
              ? goalReached
                ? campaign.withdrawn
                  ? "Funds already withdrawn"
                  : "Awaiting creator claim"
                : "No contribution to refund"
              : "No actions available"}
          </span>
        )}
      </div>

      {(err || ok) && (
        <div
          className={`text-xs rounded-lg px-3 py-2 border ${
            err ? "text-bad border-bad/30 bg-bad/5" : "text-good border-good/30 bg-good/5"
          }`}
        >
          {err || ok}
        </div>
      )}
    </div>
  );
}
