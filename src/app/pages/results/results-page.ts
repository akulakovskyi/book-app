import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TabsModule } from 'primeng/tabs';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { BookingApi } from '../../services/booking-api';
import { I18n, useT, type I18nKey } from '../../services/i18n';
import { MapView } from '../../components/map-view';
import { distanceKm } from '../../../shared/geo';
import type { ComparisonResult, Listing, Source, SplitOption, UnitPick } from '../../../shared/types';

type SortKey = 'priceAsc' | 'priceDesc' | 'ratingDesc';

const SORT_KEY_MAP: Record<SortKey, I18nKey> = {
  priceAsc: 'sort.priceAsc',
  priceDesc: 'sort.priceDesc',
  ratingDesc: 'sort.ratingDesc',
};

const SPLIT_INITIAL = 5;
const SPLIT_STEP = 5;
const CATALOG_INITIAL = 10;
const CATALOG_STEP = 10;

@Component({
  selector: 'app-results-page',
  imports: [
    RouterLink,
    FormsModule,
    ButtonModule,
    SelectModule,
    TagModule,
    CardModule,
    TooltipModule,
    TabsModule,
    InputNumberModule,
    ToggleSwitchModule,
    MapView,
  ],
  templateUrl: './results-page.html',
})
export class ResultsPage {
  private readonly api = inject(BookingApi);
  private readonly i18n = inject(I18n);

  readonly id = input.required<string>();
  protected readonly t = useT();
  protected readonly result = signal<ComparisonResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly plan = signal<Listing[]>([]);
  protected readonly sortKey = signal<SortKey>('priceAsc');
  protected readonly splitVisible = signal<Record<string, number>>({});
  protected readonly catalogVisible = signal<Record<string, number>>({});
  protected readonly catalogPage = signal<Record<string, number>>({});
  protected readonly catalogLoading = signal<Record<string, boolean>>({});
  protected readonly catalogExhausted = signal<Record<string, boolean>>({});
  protected readonly maxDistanceKm = signal<number | null>(null);
  protected readonly minRating = signal<number | null>(null);
  protected readonly maxPricePerNight = signal<number | null>(null);
  protected readonly showBrowseOnMap = signal<boolean>(false);
  protected readonly sortAltsByClosest = signal<boolean>(false);
  protected readonly expandedAltId = signal<string | null>(null);
  protected readonly pickOverrides = signal<Record<string, Listing>>({});
  protected readonly openSwapKey = signal<string | null>(null);
  protected readonly geocoding = signal(false);
  private readonly geocodeInFlight = new Set<string>();
  protected readonly SPLIT_INITIAL = SPLIT_INITIAL;
  protected readonly CATALOG_INITIAL = CATALOG_INITIAL;

  protected readonly filtersActive = computed(() => {
    return [
      this.maxDistanceKm() != null,
      this.minRating() != null,
      this.maxPricePerNight() != null,
    ].filter(Boolean).length;
  });
  protected readonly sortOptions = computed(() => {
    void this.i18n.lang();
    return (Object.keys(SORT_KEY_MAP) as SortKey[]).map((value) => ({
      label: this.t(SORT_KEY_MAP[value]),
      value,
    }));
  });

  protected readonly reportUrl = computed(() => this.api.reportUrl(this.id()));
  protected readonly heroImageUrl = computed(() => {
    const dest = this.result()?.input.destination;
    if (!dest) return '';
    const q = encodeURIComponent(dest.toLowerCase());
    return `https://source.unsplash.com/1600x500/?${q},skyline,city`;
  });
  protected readonly planCapacity = computed(() =>
    this.plan().reduce((s, l) => s + (l.capacity ?? 0), 0),
  );
  protected readonly planTotalPrice = computed(() =>
    this.plan().reduce((s, l) => s + (l.priceTotal ?? 0), 0),
  );
  protected readonly planCurrency = computed(
    () => this.plan()[0]?.currency ?? this.result()?.input.currency ?? 'EUR',
  );
  protected readonly planShortage = computed(() => {
    const guests = this.result()?.input.totalGuests ?? 0;
    return Math.max(guests - this.planCapacity(), 0);
  });
  protected readonly planOverflow = computed(() => {
    const guests = this.result()?.input.totalGuests ?? 0;
    return Math.max(this.planCapacity() - guests, 0);
  });

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.api.getComparison(this.id()).subscribe({
      next: (r) => this.result.set(r),
      error: (err) => this.error.set(err?.error?.message ?? 'Not found'),
    });
  }

  sortListings(listings: Listing[]): Listing[] {
    const filtered = listings.filter((l) => this.passesFilter(l));
    const key = this.sortKey();
    const sorted = [...filtered];
    if (key === 'priceAsc') {
      sorted.sort((a, b) => (a.priceTotal ?? Infinity) - (b.priceTotal ?? Infinity));
    } else if (key === 'priceDesc') {
      sorted.sort((a, b) => (b.priceTotal ?? 0) - (a.priceTotal ?? 0));
    } else {
      sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return sorted;
  }

  passesFilter(l: Listing): boolean {
    const minRating = this.minRating();
    if (minRating != null && (l.rating ?? 0) < minRating) return false;

    const maxPrice = this.maxPricePerNight();
    if (maxPrice != null && (l.pricePerNight ?? Infinity) > maxPrice) return false;

    const maxDist = this.maxDistanceKm();
    if (maxDist != null) {
      const center = this.result()?.center;
      if (center && l.coordinate) {
        const d = distanceKm(center, l.coordinate);
        if (d > maxDist) return false;
      }
    }
    return true;
  }

  sourceTotals(unit: { size: number; booking: Listing[]; airbnb: Listing[] }, source: 'booking' | 'airbnb'): { shown: number; total: number } {
    const list = source === 'booking' ? unit.booking : unit.airbnb;
    return { shown: this.sortListings(list).length, total: list.length };
  }

  clearFilters(): void {
    this.maxDistanceKm.set(null);
    this.minRating.set(null);
    this.maxPricePerNight.set(null);
  }

  filteredCatalogListings(): Listing[] {
    const r = this.result();
    if (!r) return [];
    const out: Listing[] = [];
    const seen = new Set<string>();
    for (const u of r.perUnit) {
      for (const l of [...u.booking, ...u.airbnb]) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        if (this.passesFilter(l)) out.push(l);
      }
    }
    return out;
  }

  mapListings(): Listing[] {
    const plan = this.plan();
    if (!this.showBrowseOnMap()) return plan;
    const planIds = new Set(plan.map((l) => l.id));
    const extras = this.filteredCatalogListings().filter((l) => !planIds.has(l.id));
    return [...plan, ...extras];
  }

  mapHighlightIds(): string[] {
    return this.plan().map((l) => l.id);
  }

  altMaxDistanceKm(alt: SplitOption): number | null {
    const coords = this.effectivePicks(alt)
      .map((p) => p.listing.coordinate)
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (coords.length < 2) return null;
    let max = 0;
    for (let i = 0; i < coords.length; i++) {
      for (let j = i + 1; j < coords.length; j++) {
        const d = distanceKm(coords[i], coords[j]);
        if (d > max) max = d;
      }
    }
    return max;
  }

  private pickKey(altId: string, pickIndex: number): string {
    return `${altId}::${pickIndex}`;
  }

  effectivePicks(alt: SplitOption): UnitPick[] {
    const ovs = this.pickOverrides();
    return alt.picks.map((p, i) => {
      const rep = ovs[this.pickKey(alt.id, i)];
      return rep ? { unitSize: p.unitSize, listing: rep } : p;
    });
  }

  altTotalPrice(alt: SplitOption): number {
    return this.effectivePicks(alt).reduce((s, p) => s + (p.listing.priceTotal ?? 0), 0);
  }

  altPricePerPerson(alt: SplitOption): number {
    const guests = alt.picks.reduce((s, p) => s + p.unitSize, 0);
    return guests > 0 ? this.altTotalPrice(alt) / guests : 0;
  }

  altCurrency(alt: SplitOption): string {
    return this.effectivePicks(alt)[0]?.listing.currency ?? alt.currency;
  }

  altSources(alt: SplitOption): Source[] {
    return [...new Set(this.effectivePicks(alt).map((p) => p.listing.source))];
  }

  altAverageRating(alt: SplitOption): number | null {
    const ratings = this.effectivePicks(alt)
      .map((p) => p.listing.rating)
      .filter((r): r is number => r != null);
    if (!ratings.length) return null;
    return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  }

  altCustomized(alt: SplitOption): boolean {
    const ovs = this.pickOverrides();
    for (let i = 0; i < alt.picks.length; i++) {
      if (ovs[this.pickKey(alt.id, i)]) return true;
    }
    return false;
  }

  isPickCustomized(alt: SplitOption, pickIndex: number): boolean {
    return !!this.pickOverrides()[this.pickKey(alt.id, pickIndex)];
  }

  isSwapOpen(alt: SplitOption, pickIndex: number): boolean {
    return this.openSwapKey() === this.pickKey(alt.id, pickIndex);
  }

  toggleSwap(alt: SplitOption, pickIndex: number): void {
    const key = this.pickKey(alt.id, pickIndex);
    this.openSwapKey.update((cur) => (cur === key ? null : key));
  }

  swapCandidates(alt: SplitOption, pickIndex: number): Listing[] {
    const r = this.result();
    if (!r) return [];
    const unitSize = alt.picks[pickIndex]?.unitSize;
    if (unitSize == null) return [];
    const catalog = r.perUnit.find((u) => u.size === unitSize);
    if (!catalog) return [];
    const inUse = new Set(this.effectivePicks(alt).map((p) => p.listing.id));
    return [...catalog.booking, ...catalog.airbnb]
      .filter((l) => !inUse.has(l.id) && l.priceTotal != null)
      .sort((a, b) => (a.priceTotal ?? Infinity) - (b.priceTotal ?? Infinity));
  }

  applySwap(alt: SplitOption, pickIndex: number, listing: Listing): void {
    const key = this.pickKey(alt.id, pickIndex);
    this.pickOverrides.update((m) => ({ ...m, [key]: listing }));
    this.openSwapKey.set(null);
    if (!listing.coordinate) this.resolveCoordinate(listing);
  }

  resetPick(alt: SplitOption, pickIndex: number): void {
    const key = this.pickKey(alt.id, pickIndex);
    this.pickOverrides.update((m) => {
      if (!(key in m)) return m;
      const next = { ...m };
      delete next[key];
      return next;
    });
    this.openSwapKey.set(null);
  }

  sortedAlternatives(alts: SplitOption[]): SplitOption[] {
    if (!this.sortAltsByClosest()) return alts;
    return [...alts].sort((a, b) => {
      const da = this.altMaxDistanceKm(a);
      const db = this.altMaxDistanceKm(b);
      if (da == null && db == null) return this.altTotalPrice(a) - this.altTotalPrice(b);
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }

  toggleSortByClosest(): void {
    const next = !this.sortAltsByClosest();
    this.sortAltsByClosest.set(next);
    if (next) this.batchResolveCoords();
  }

  toggleAltMap(alt: SplitOption): void {
    const current = this.expandedAltId();
    if (current === alt.id) {
      this.expandedAltId.set(null);
      return;
    }
    this.expandedAltId.set(alt.id);
    for (const pick of this.effectivePicks(alt)) {
      if (!pick.listing.coordinate) this.resolveCoordinate(pick.listing);
    }
  }

  isAltExpanded(altId: string): boolean {
    return this.expandedAltId() === altId;
  }

  altListings(alt: SplitOption): Listing[] {
    return this.effectivePicks(alt).map((p) => p.listing);
  }

  formatDistance(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  }

  onDistanceFilterChange(value: number | null): void {
    this.maxDistanceKm.set(value);
    if (value != null) this.batchResolveCoords();
  }

  private batchResolveCoords(): void {
    const r = this.result();
    if (!r) return;
    const destination = r.input.destination;
    if (!destination) return;

    const toResolve: Listing[] = [];
    const seen = new Set<string>();
    for (const u of r.perUnit) {
      for (const l of [...u.booking, ...u.airbnb]) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        if (!l.coordinate && !this.geocodeInFlight.has(l.id)) toResolve.push(l);
      }
    }
    if (toResolve.length === 0) return;

    this.geocoding.set(true);
    for (const l of toResolve) this.geocodeInFlight.add(l.id);

    const runNext = (idx: number) => {
      if (idx >= toResolve.length) {
        this.geocoding.set(false);
        return;
      }
      const listing = toResolve[idx];
      this.api
        .geocodeListing({
          title: listing.title,
          location: listing.location ?? undefined,
          destination,
        })
        .subscribe({
          next: (coord) => {
            this.updateListingCoord(listing.id, coord);
          },
          error: () => undefined,
          complete: () => {
            this.geocodeInFlight.delete(listing.id);
            runNext(idx + 1);
          },
        });
    };
    runNext(0);
  }

  private updateListingCoord(listingId: string, coord: Listing['coordinate']): void {
    this.result.update((prev) => {
      if (!prev) return prev;
      const perUnit = prev.perUnit.map((u) => ({
        ...u,
        booking: u.booking.map((l) => (l.id === listingId ? { ...l, coordinate: coord } : l)),
        airbnb: u.airbnb.map((l) => (l.id === listingId ? { ...l, coordinate: coord } : l)),
      }));
      const splitGroups = prev.splitGroups.map((g) => ({
        ...g,
        alternatives: g.alternatives.map((alt) => ({
          ...alt,
          picks: alt.picks.map((pick) =>
            pick.listing.id === listingId
              ? { ...pick, listing: { ...pick.listing, coordinate: coord } }
              : pick,
          ),
        })),
      }));
      return { ...prev, perUnit, splitGroups };
    });
    this.plan.update((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, coordinate: coord } : l)),
    );
    this.pickOverrides.update((prev) => {
      let changed = false;
      const next: Record<string, Listing> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v.id === listingId) {
          next[k] = { ...v, coordinate: coord };
          changed = true;
        } else {
          next[k] = v;
        }
      }
      return changed ? next : prev;
    });
  }

  togglePlan(listing: Listing): void {
    const current = this.plan();
    const i = current.findIndex((l) => l.id === listing.id);
    if (i >= 0) {
      this.plan.set(current.filter((_, idx) => idx !== i));
    } else {
      this.plan.set([...current, listing]);
      if (!listing.coordinate) this.resolveCoordinate(listing);
    }
  }

  private resolveCoordinate(listing: Listing): void {
    const destination = this.result()?.input.destination ?? '';
    if (!destination) return;
    if (this.geocodeInFlight.has(listing.id)) return;
    this.geocodeInFlight.add(listing.id);

    this.api
      .geocodeListing({
        title: listing.title,
        location: listing.location ?? undefined,
        destination,
      })
      .subscribe({
        next: (coord) => this.updateListingCoord(listing.id, coord),
        error: () => undefined,
        complete: () => this.geocodeInFlight.delete(listing.id),
      });
  }

  inPlan(listing: Listing): boolean {
    return this.plan().some((l) => l.id === listing.id);
  }

  clearPlan(): void {
    this.plan.set([]);
  }

  splitShown(groupId: string): number {
    return this.splitVisible()[groupId] ?? SPLIT_INITIAL;
  }

  showMoreSplit(groupId: string): void {
    this.splitVisible.update((m) => ({
      ...m,
      [groupId]: (m[groupId] ?? SPLIT_INITIAL) + SPLIT_STEP,
    }));
  }

  collapseSplit(groupId: string): void {
    this.splitVisible.update((m) => ({ ...m, [groupId]: SPLIT_INITIAL }));
  }

  catalogShown(size: number, source: 'booking' | 'airbnb'): number {
    return this.catalogVisible()[`${size}-${source}`] ?? CATALOG_INITIAL;
  }

  showMoreCatalog(size: number, source: 'booking' | 'airbnb'): void {
    const key = `${size}-${source}`;
    this.catalogVisible.update((m) => ({
      ...m,
      [key]: (m[key] ?? CATALOG_INITIAL) + CATALOG_STEP,
    }));
  }

  collapseCatalog(size: number, source: 'booking' | 'airbnb'): void {
    const key = `${size}-${source}`;
    this.catalogVisible.update((m) => ({ ...m, [key]: CATALOG_INITIAL }));
  }

  slice<T>(arr: T[], n: number): T[] {
    return arr.slice(0, n);
  }

  isCatalogLoading(size: number, source: 'booking' | 'airbnb'): boolean {
    return !!this.catalogLoading()[`${size}-${source}`];
  }

  isCatalogExhausted(size: number, source: 'booking' | 'airbnb'): boolean {
    return !!this.catalogExhausted()[`${size}-${source}`];
  }

  catalogCurrentPage(size: number, source: 'booking' | 'airbnb'): number {
    return this.catalogPage()[`${size}-${source}`] ?? 1;
  }

  fetchMore(size: number, source: 'booking' | 'airbnb'): void {
    const key = `${size}-${source}`;
    if (this.isCatalogLoading(size, source) || this.isCatalogExhausted(size, source)) return;

    const nextPage = this.catalogCurrentPage(size, source) + 1;
    if (nextPage > 5) {
      this.catalogExhausted.update((m) => ({ ...m, [key]: true }));
      return;
    }

    this.catalogLoading.update((m) => ({ ...m, [key]: true }));

    this.api.loadMore(this.id(), size, source, nextPage).subscribe({
      next: (r) => {
        this.catalogLoading.update((m) => ({ ...m, [key]: false }));
        this.catalogPage.update((m) => ({ ...m, [key]: nextPage }));

        if (r.listings.length === 0) {
          this.catalogExhausted.update((m) => ({ ...m, [key]: true }));
          return;
        }

        this.result.update((prev) => {
          if (!prev) return prev;
          const perUnit = prev.perUnit.map((u) => {
            if (u.size !== size) return u;
            return source === 'booking'
              ? { ...u, booking: [...u.booking, ...r.listings] }
              : { ...u, airbnb: [...u.airbnb, ...r.listings] };
          });
          return { ...prev, perUnit };
        });

        this.catalogVisible.update((m) => ({
          ...m,
          [key]: (m[key] ?? CATALOG_INITIAL) + r.listings.length,
        }));
      },
      error: () => {
        this.catalogLoading.update((m) => ({ ...m, [key]: false }));
      },
    });
  }

  formatMoney(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'EUR',
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${Math.round(amount)} ${currency}`;
    }
  }
}
