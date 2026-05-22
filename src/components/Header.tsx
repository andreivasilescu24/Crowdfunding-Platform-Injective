"use client";

import { useWallet } from "./WalletProvider";
import { shortAddr } from "@/lib/format";

export function Header() {
  const { address, connecting, error, connect, disconnect } = useWallet();

  return (
    <header className="border-b border-edge bg-ink/60 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-accent2 shadow-[0_0_30px_rgba(0,240,255,0.35)]" />
          <div>
            <div className="text-lg font-semibold tracking-tight">Injective Crowdfund</div>
            <div className="text-xs text-white/40">Permissionless fundraising on INJ</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <span className="hidden md:inline text-xs text-bad/90 max-w-xs truncate" title={error}>
              {error}
            </span>
          )}
          {address ? (
            <div className="flex items-center gap-2">
              <span className="chip">
                <span className="h-2 w-2 rounded-full bg-good" />
                <span className="font-mono">{shortAddr(address)}</span>
              </span>
              <button className="btn-ghost text-sm" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Keplr"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
