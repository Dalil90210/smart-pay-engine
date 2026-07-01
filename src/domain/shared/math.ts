/**
 * Shared kernel — small, dependency-free numeric helpers used by the scoring
 * models. Kept separate so the scoring logic reads declaratively.
 */

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamp into the canonical probability percentage range [0, 100]. */
export function clampPct(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

/** Linearly map `value` from [inMin, inMax] onto [outMin, outMax] (clamped). */
export function lerp(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + t * (outMax - outMin);
}

/** A single weighted contribution to a composite score. */
export interface WeightedFactor {
  /** Human-readable identifier, surfaced in explanations. */
  readonly label: string;
  /** Normalized score in [0, 1] for this factor. */
  readonly score: number;
  /** Relative importance (any positive number; weights are normalized). */
  readonly weight: number;
  /** Optional plain-language rationale for the factor's score. */
  readonly detail?: string;
}

/**
 * Combine weighted factors into a single [0, 1] score using a normalized
 * weighted average. Factors with non-positive weight are ignored.
 */
export function weightedAverage(factors: readonly WeightedFactor[]): number {
  const usable = factors.filter((f) => f.weight > 0);
  const totalWeight = usable.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = usable.reduce((sum, f) => sum + clamp(f.score, 0, 1) * f.weight, 0);
  return weighted / totalWeight;
}

/** Round to a fixed number of decimal places (avoids float noise in output). */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
