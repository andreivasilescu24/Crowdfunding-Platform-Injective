"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";
import { contract } from "@/lib/contract";

type Props = { onCreated: () => void };

const DURATION_OPTIONS = [
  { label: "1 day", seconds: 60 * 60 * 24 },
  { label: "3 days", seconds: 60 * 60 * 24 * 3 },
  { label: "7 days", seconds: 60 * 60 * 24 * 7 },
  { label: "14 days", seconds: 60 * 60 * 24 * 14 },
  { label: "30 days", seconds: 60 * 60 * 24 * 30 },
];

export function CreateCampaignForm({ onCreated }: Props) {
  const { address, connect } = useWallet();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [duration, setDuration] = useState(DURATION_OPTIONS[2].seconds);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setGoal("");
    setDuration(DURATION_OPTIONS[2].seconds);
    setErr(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!address) {
      setErr("Connect your wallet first");
      return;
    }
    const g = parseFloat(goal);
    if (!title.trim()) return setErr("Title is required");
    if (!isFinite(g) || g <= 0) return setErr("Goal must be a positive INJ amount");

    try {
      setBusy(true);
      await contract.create({
        creator: address,
        title,
        description,
        goalInj: goal,
        durationSec: duration,
      });
      reset();
      setOpen(false);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="card p-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Start a new campaign</h2>
          <p className="text-sm text-white/60">
            Set a goal in INJ and a deadline. Donors get refunded automatically if you miss it.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => (address ? setOpen(true) : connect())}
        >
          {address ? "New campaign" : "Connect to start"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">New campaign</h2>
        <button
          type="button"
          className="text-sm text-white/50 hover:text-white"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          Cancel
        </button>
      </div>

      <div>
        <label className="label">Title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Decentralized SIP analytics tool"
          maxLength={120}
        />
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          className="input min-h-[96px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What will the funds be used for?"
          maxLength={600}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Goal (INJ)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.0001"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="100"
          />
        </div>
        <div>
          <label className="label">Duration</label>
          <select
            className="input"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err && (
        <div className="text-xs rounded-lg px-3 py-2 border text-bad border-bad/30 bg-bad/5">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Signing…" : "Create campaign"}
        </button>
      </div>
    </form>
  );
}
