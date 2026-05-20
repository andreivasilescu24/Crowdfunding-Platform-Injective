"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { connectKeplr } from "@/lib/keplr";

type WalletState = {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const Ctx = createContext<WalletState | null>(null);

const LS_KEY = "cf.wallet.address";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    if (saved) setAddress(saved);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectKeplr();
      setAddress(addr);
      window.localStorage.setItem(LS_KEY, addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    window.localStorage.removeItem(LS_KEY);
  }, []);

  const value = useMemo(
    () => ({ address, connecting, error, connect, disconnect }),
    [address, connecting, error, connect, disconnect],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
