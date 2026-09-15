export function roundSmart(n: number): number {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? -1 : 1;
  const rounded = abs >= 0.01 ? Math.round(abs * 100) / 100 : Number(abs.toPrecision(1));
  return sign * rounded;
}