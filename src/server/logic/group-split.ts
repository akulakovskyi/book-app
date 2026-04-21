export interface SplitOptions {
  minUnitSize: number;
  maxUnitSize: number;
  maxUnits: number;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  minUnitSize: 2,
  maxUnitSize: 10,
  maxUnits: 4,
};

/**
 * Integer partitions of `total` in non-increasing order, each part in
 * [minUnitSize..maxUnitSize], at most `maxUnits` parts.
 */
export function enumerateSplits(total: number, options: Partial<SplitOptions> = {}): number[][] {
  const opts = { ...DEFAULT_SPLIT_OPTIONS, ...options };
  if (total < opts.minUnitSize) return [[total]];

  const out: number[][] = [];
  const stack: number[] = [];

  function recurse(remaining: number, maxPart: number) {
    if (remaining === 0) {
      out.push([...stack]);
      return;
    }
    if (stack.length === opts.maxUnits) return;
    const upper = Math.min(maxPart, opts.maxUnitSize, remaining);
    const lower = opts.minUnitSize;
    for (let part = upper; part >= lower; part--) {
      if (remaining - part !== 0 && remaining - part < opts.minUnitSize) continue;
      stack.push(part);
      recurse(remaining - part, part);
      stack.pop();
    }
  }

  recurse(total, opts.maxUnitSize);
  return out;
}

export function splitLabel(units: number[]): string {
  const counts = new Map<number, number>();
  for (const u of units) counts.set(u, (counts.get(u) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([size, count]) => (count === 1 ? `1×${size}` : `${count}×${size}`));
  return parts.join(' + ');
}

export function uniqueUnitSizes(splits: number[][]): number[] {
  const set = new Set<number>();
  for (const split of splits) for (const u of split) set.add(u);
  return [...set].sort((a, b) => b - a);
}
