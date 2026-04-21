import { randomUUID } from 'node:crypto';
import { searchBooking } from '../scrapers/booking.js';
import { searchAirbnb } from '../scrapers/airbnb.js';
import { nightsBetween } from '../scrapers/util.js';
import {
  DEFAULT_SPLIT_OPTIONS,
  enumerateSplits,
  splitLabel,
  uniqueUnitSizes,
} from './group-split.js';
import type {
  ComparisonResult,
  Listing,
  SearchInput,
  SplitGroup,
  SplitOption,
  UnitCatalog,
  UnitPick,
} from '../../shared/types.js';

const TOP_PER_SOURCE = 50;
const ALTERNATIVES_PER_SPLIT = 50;
const POOL_DEPTH_PER_SIZE = 18;

export async function runComparison(input: SearchInput): Promise<ComparisonResult> {
  const splitOpts = {
    ...DEFAULT_SPLIT_OPTIONS,
    minUnitSize: input.minUnitSize ?? DEFAULT_SPLIT_OPTIONS.minUnitSize,
    maxUnits: input.maxSplitUnits ?? DEFAULT_SPLIT_OPTIONS.maxUnits,
  };
  const partitions = enumerateSplits(input.totalGuests, splitOpts);
  const unitSizes = uniqueUnitSizes(partitions);

  const perUnit = new Map<number, Listing[]>();
  for (const size of unitSizes) {
    const [booking, airbnb] = await Promise.all([
      searchBooking(input, size).catch((err) => {
        console.error(`[booking] size=${size} failed:`, err?.message);
        return [] as Listing[];
      }),
      searchAirbnb(input, size).catch((err) => {
        console.error(`[airbnb] size=${size} failed:`, err?.message);
        return [] as Listing[];
      }),
    ]);
    const withPrice = [...booking, ...airbnb].filter((l) => l.priceTotal != null);
    console.log(
      `[compare] size=${size} booking=${booking.length} airbnb=${airbnb.length} withPrice=${withPrice.length}`,
    );
    perUnit.set(size, [...booking, ...airbnb]);
  }

  const nights = nightsBetween(input.checkIn, input.checkOut);

  const splitGroups: SplitGroup[] = partitions
    .map((units) => buildSplitGroup(units, perUnit))
    .filter((g): g is SplitGroup => g !== null);

  splitGroups.sort((a, b) =>
    bestPricePerPerson(a) - bestPricePerPerson(b),
  );

  const catalog: UnitCatalog[] = unitSizes
    .slice()
    .sort((a, b) => b - a)
    .map((size) => {
      const all = perUnit.get(size) ?? [];
      return {
        size,
        booking: topByPrice(all.filter((l) => l.source === 'booking'), TOP_PER_SOURCE),
        airbnb: topByPrice(all.filter((l) => l.source === 'airbnb'), TOP_PER_SOURCE),
      };
    });

  return {
    id: randomUUID(),
    input,
    nights,
    createdAt: new Date().toISOString(),
    splitGroups,
    perUnit: catalog,
  };
}

function buildSplitGroup(
  units: number[],
  perUnit: Map<number, Listing[]>,
): SplitGroup | null {
  const sizeCounts = new Map<number, number>();
  for (const s of units) sizeCounts.set(s, (sizeCounts.get(s) ?? 0) + 1);

  const perSizeCombos: Array<{ size: number; combos: Listing[][] }> = [];
  for (const [size, count] of sizeCounts) {
    const pool = topByPrice(perUnit.get(size) ?? [], POOL_DEPTH_PER_SIZE);
    if (pool.length < count) return null;
    const combos = kCombinations(pool, count)
      .sort((a, b) => totalOf(a) - totalOf(b))
      .slice(0, ALTERNATIVES_PER_SPLIT * 3);
    perSizeCombos.push({ size, combos });
  }

  let joined: Listing[][] = [[]];
  for (const { combos } of perSizeCombos) {
    const next: Listing[][] = [];
    for (const existing of joined) {
      for (const combo of combos) {
        next.push([...existing, ...combo]);
      }
    }
    joined = next
      .sort((a, b) => totalOf(a) - totalOf(b))
      .slice(0, ALTERNATIVES_PER_SPLIT * 3);
  }

  const seenSignatures = new Set<string>();
  const alternatives: SplitOption[] = [];
  for (const listings of joined) {
    const ids = listings.map((l) => l.id);
    if (new Set(ids).size !== ids.length) continue;
    const sig = [...ids].sort().join('|');
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);

    const option = buildSplitOption(units, listings);
    if (option) alternatives.push(option);
    if (alternatives.length >= ALTERNATIVES_PER_SPLIT) break;
  }

  if (alternatives.length === 0) return null;

  return {
    id: units.join('-'),
    label: splitLabel(units),
    units,
    alternatives,
  };
}

function buildSplitOption(units: number[], listings: Listing[]): SplitOption | null {
  const byCapacity = new Map<number, Listing[]>();
  for (const l of listings) {
    const cap = l.capacity ?? 0;
    if (!byCapacity.has(cap)) byCapacity.set(cap, []);
    byCapacity.get(cap)!.push(l);
  }

  const picks: UnitPick[] = [];
  const used = new Set<string>();
  for (const size of units) {
    const bucket = byCapacity.get(size) ?? [];
    const listing = bucket.find((l) => !used.has(l.id));
    if (!listing) return null;
    used.add(listing.id);
    picks.push({ unitSize: size, listing });
  }

  const currency = picks[0]?.listing.currency ?? 'EUR';
  const totalPrice = picks.reduce((s, p) => s + (p.listing.priceTotal ?? 0), 0);
  const totalGuests = units.reduce((a, b) => a + b, 0);
  const pricePerPerson = totalPrice / totalGuests;

  const ratings = picks.map((p) => p.listing.rating).filter((r): r is number => r != null);
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  return {
    id: picks.map((p) => p.listing.id).join('|'),
    picks,
    totalPrice: Math.round(totalPrice * 100) / 100,
    pricePerPerson: Math.round(pricePerPerson * 100) / 100,
    currency,
    averageRating,
    sources: [...new Set(picks.map((p) => p.listing.source))],
  };
}

function topByPrice(listings: Listing[], n: number): Listing[] {
  return listings
    .filter((l) => l.priceTotal != null)
    .sort((a, b) => (a.priceTotal ?? Infinity) - (b.priceTotal ?? Infinity))
    .slice(0, n);
}

function totalOf(listings: Listing[]): number {
  return listings.reduce((s, l) => s + (l.priceTotal ?? 0), 0);
}

function kCombinations<T>(arr: T[], k: number): T[][] {
  if (k < 1 || k > arr.length) return [];
  const out: T[][] = [];
  const chosen: T[] = [];
  (function recurse(start: number) {
    if (chosen.length === k) { out.push([...chosen]); return; }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i]);
      recurse(i + 1);
      chosen.pop();
    }
  })(0);
  return out;
}

function bestPricePerPerson(group: SplitGroup): number {
  return group.alternatives[0]?.pricePerPerson ?? Infinity;
}
