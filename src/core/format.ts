import { round2 } from "./geometry";

/**
 * Russian number formatting shared by the plugin sandbox and the UI iframe:
 * two decimals max, decimal comma, non-breaking-space thousand groups and a
 * typographic minus. Keep this the single source of truth — the UI used to
 * ship its own diverging copy of this logic.
 */
export function formatRuNumber(n: number): string {
  const rounded = round2(n);
  const sign = rounded < 0 ? "\u2212" : "";
  const abs = Math.abs(rounded);
  const [intPart, decimalPart = ""] = String(abs).split(".");
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const trimmedDecimal = decimalPart.replace(/0+$/, "");

  return sign + groupedInt + (trimmedDecimal ? "," + trimmedDecimal : "");
}

export function formatRuPercent(n: number): string {
  return formatRuNumber(n) + "\u00a0%";
}

/** UI variant: metrics render an em-dash placeholder for missing values. */
export function formatRuNumberOrDash(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return formatRuNumber(n);
}

export function formatRuPercentOrDash(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return formatRuPercent(n);
}
