import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TabsModule } from 'primeng/tabs';
import { BookingApi } from '../../services/booking-api';
import { I18n, useT, type I18nKey } from '../../services/i18n';
import { MapView } from '../../components/map-view';
import type { ComparisonResult, Listing } from '../../../shared/types';

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
  protected readonly SPLIT_INITIAL = SPLIT_INITIAL;
  protected readonly CATALOG_INITIAL = CATALOG_INITIAL;
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
    const key = this.sortKey();
    const sorted = [...listings];
    if (key === 'priceAsc') {
      sorted.sort((a, b) => (a.priceTotal ?? Infinity) - (b.priceTotal ?? Infinity));
    } else if (key === 'priceDesc') {
      sorted.sort((a, b) => (b.priceTotal ?? 0) - (a.priceTotal ?? 0));
    } else {
      sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return sorted;
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

    this.api
      .geocodeListing({
        title: listing.title,
        location: listing.location ?? undefined,
        destination,
      })
      .subscribe({
        next: (coord) => {
          const updated = this.plan().map((l) =>
            l.id === listing.id ? { ...l, coordinate: coord } : l,
          );
          this.plan.set(updated);
          this.result.update((prev) => {
            if (!prev) return prev;
            const perUnit = prev.perUnit.map((u) => ({
              ...u,
              booking: u.booking.map((l) => (l.id === listing.id ? { ...l, coordinate: coord } : l)),
              airbnb: u.airbnb.map((l) => (l.id === listing.id ? { ...l, coordinate: coord } : l)),
            }));
            return { ...prev, perUnit };
          });
        },
        error: () => undefined,
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
