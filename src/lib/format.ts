export function shortAddr(addr: string | undefined | null): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function fmtInj(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return "0 INJ";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} INJ`;
}

export function fmtCountdown(deadlineSec: number): string {
  const diff = deadlineSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Ended";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function pct(raised: string, goal: string): number {
  const r = parseFloat(raised);
  const g = parseFloat(goal);
  if (!isFinite(r) || !isFinite(g) || g <= 0) return 0;
  return Math.min(100, Math.max(0, (r / g) * 100));
}
