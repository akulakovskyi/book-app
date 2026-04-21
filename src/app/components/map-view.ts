import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Coordinate, Listing } from '../../shared/types';

type LeafletMap = import('leaflet').Map;
type LeafletMarker = import('leaflet').Marker;
type LeafletLib = typeof import('leaflet');

@Component({
  selector: 'app-map-view',
  template: `
    <div class="relative isolate overflow-hidden rounded-3xl border border-black/10 bg-neutral-100" style="z-index: 0">
      <div #mapEl class="h-[360px] w-full sm:h-[420px]"></div>
      @if (!hasCoords()) {
        <div class="pointer-events-none absolute inset-0 flex items-end p-4">
          <div class="pointer-events-auto rounded-xl bg-white/90 px-3 py-2 text-[12px] text-neutral-700 shadow-lg backdrop-blur">
            <i class="pi pi-info-circle mr-1 text-[11px]"></i>
            {{ emptyHint }}
          </div>
        </div>
      }
    </div>
  `,
})
export class MapView implements AfterViewInit, OnChanges, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  @Input() listings: Listing[] = [];
  @Input() center: Coordinate | null | undefined = null;
  @Input() emptyHint = 'Pick listings to see them on the map';

  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

  private L?: LeafletLib;
  private map?: LeafletMap;
  private markers: LeafletMarker[] = [];
  private resizeObserver?: ResizeObserver;

  hasCoords(): boolean {
    return this.listings.some((l) => l.coordinate);
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.L = await import('leaflet');
    this.initMap();
    this.render();
  }

  ngOnChanges(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.map) this.render();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private initMap(): void {
    if (!this.L || !this.mapEl) return;
    const start = this.center ?? { lat: 52.37, lon: 4.89 };
    this.map = this.L.map(this.mapEl.nativeElement, {
      zoomControl: true,
      attributionControl: true,
    }).setView([start.lat, start.lon], 12);

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });
      this.resizeObserver.observe(this.mapEl.nativeElement);
    }

    const kicks = [50, 250, 600, 1200];
    for (const ms of kicks) {
      setTimeout(() => this.map?.invalidateSize(), ms);
    }
  }

  private render(): void {
    if (!this.L || !this.map) return;

    for (const m of this.markers) m.remove();
    this.markers = [];

    const withCoords = this.listings.filter(
      (l): l is Listing & { coordinate: Coordinate } => !!l.coordinate,
    );

    const positioned = this.spreadOverlapping(withCoords);

    for (const { listing, lat, lon } of positioned) {
      const icon = this.L.divIcon({
        html: this.pinHtml(listing),
        className: 'listing-marker',
        iconSize: [80, 34],
        iconAnchor: [40, 34],
      });
      const marker = this.L.marker([lat, lon], { icon });
      const popupHtml = this.popupHtml(listing);
      marker.bindPopup(popupHtml);
      marker.addTo(this.map);
      this.markers.push(marker);
    }

    if (positioned.length > 1) {
      const bounds = this.L.latLngBounds(positioned.map((p) => [p.lat, p.lon]));
      this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    } else if (positioned.length === 1) {
      this.map.setView([positioned[0].lat, positioned[0].lon], 13);
    } else if (this.center) {
      this.map.setView([this.center.lat, this.center.lon], 12);
    }
  }

  private spreadOverlapping(
    items: Array<Listing & { coordinate: Coordinate }>,
  ): Array<{ listing: Listing; lat: number; lon: number }> {
    const groups = new Map<string, Array<Listing & { coordinate: Coordinate }>>();
    for (const l of items) {
      const key = `${l.coordinate.lat.toFixed(3)}_${l.coordinate.lon.toFixed(3)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    }

    const out: Array<{ listing: Listing; lat: number; lon: number }> = [];
    const radius = 0.0009;
    for (const group of groups.values()) {
      if (group.length === 1) {
        const l = group[0];
        out.push({ listing: l, lat: l.coordinate.lat, lon: l.coordinate.lon });
        continue;
      }
      group.forEach((l, i) => {
        const angle = (2 * Math.PI * i) / group.length;
        const latCorrection = Math.cos((l.coordinate.lat * Math.PI) / 180);
        out.push({
          listing: l,
          lat: l.coordinate.lat + Math.cos(angle) * radius,
          lon: l.coordinate.lon + (Math.sin(angle) * radius) / Math.max(latCorrection, 0.1),
        });
      });
    }
    return out;
  }

  private pinHtml(l: Listing): string {
    const bg = l.source === 'booking' ? '#1e40af' : '#b91c1c';
    const priceLabel = l.priceTotal != null
      ? this.formatMoney(l.priceTotal, l.currency)
      : '—';
    return `
      <div style="
        display:inline-flex;align-items:center;gap:4px;
        padding:4px 10px;border-radius:9999px;
        background:${bg};color:white;font-size:12px;font-weight:600;
        box-shadow:0 4px 12px rgba(0,0,0,0.2),0 0 0 2px white;
        white-space:nowrap;transform:translateY(-6px);
      ">${priceLabel}</div>
    `;
  }

  private popupHtml(l: Listing): string {
    const safeTitle = escapeHtml(l.title);
    const safeUrl = escapeHtml(l.url);
    const priceLine = l.priceTotal != null ? this.formatMoney(l.priceTotal, l.currency) : '';
    return `
      <div style="min-width:200px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280">
          ${l.source} · ${l.capacity ?? ''} guests
        </div>
        <div style="font-weight:600;font-size:13px;margin-top:4px;line-height:1.25">${safeTitle}</div>
        <div style="margin-top:6px;font-size:13px;font-weight:600;color:#0a0a0a">${priceLine}</div>
        <a href="${safeUrl}" target="_blank" rel="noopener"
           style="display:inline-block;margin-top:8px;font-size:12px;color:#1e40af;text-decoration:underline">
          Open listing →
        </a>
      </div>
    `;
  }

  private formatMoney(amount: number, currency: string): string {
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

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}
