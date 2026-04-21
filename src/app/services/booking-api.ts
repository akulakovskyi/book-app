import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { ComparisonResult, Coordinate, Listing, SearchInput } from '../../shared/types';

export interface MoreResponse {
  size: number;
  source: 'booking' | 'airbnb';
  page: number;
  added: number;
  listings: Listing[];
}

@Injectable({ providedIn: 'root' })
export class BookingApi {
  private readonly http = inject(HttpClient);

  search(input: SearchInput) {
    return this.http.post<ComparisonResult>('/api/search', input);
  }

  getComparison(id: string) {
    return this.http.get<ComparisonResult>(`/api/comparison/${id}`);
  }

  loadMore(id: string, size: number, source: 'booking' | 'airbnb', page: number) {
    return this.http.post<MoreResponse>(`/api/comparison/${id}/more`, { size, source, page });
  }

  geocode(query: string) {
    const params = new URLSearchParams({ q: query });
    return this.http.get<Coordinate>(`/api/geocode?${params.toString()}`);
  }

  geocodeListing(opts: { title?: string; location?: string; destination: string }) {
    const params = new URLSearchParams();
    if (opts.title) params.set('title', opts.title);
    if (opts.location) params.set('location', opts.location);
    params.set('destination', opts.destination);
    return this.http.get<Coordinate>(`/api/geocode-listing?${params.toString()}`);
  }

  reportUrl(id: string): string {
    return `/api/report/${id}`;
  }
}
