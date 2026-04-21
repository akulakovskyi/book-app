export type Source = 'booking' | 'airbnb';

export interface SearchInput {
  destination: string;
  checkIn: string;
  checkOut: string;
  totalGuests: number;
  excludeHostels?: boolean;
  currency?: string;
  maxSplitUnits?: number;
  minUnitSize?: number;
}

export interface Listing {
  id: string;
  source: Source;
  title: string;
  url: string;
  images: string[];
  pricePerNight: number | null;
  priceTotal: number | null;
  currency: string;
  rating: number | null;
  reviewsCount: number | null;
  capacity: number | null;
  beds: number | null;
  bedrooms: number | null;
  propertyType: string | null;
  isHostel: boolean;
  location: string | null;
  amenities: string[];
  raw?: unknown;
}

export interface UnitPick {
  unitSize: number;
  listing: Listing;
}

export interface SplitOption {
  id: string;
  picks: UnitPick[];
  totalPrice: number;
  pricePerPerson: number;
  currency: string;
  averageRating: number | null;
  sources: Source[];
}

export interface SplitGroup {
  id: string;
  label: string;
  units: number[];
  alternatives: SplitOption[];
}

export interface UnitCatalog {
  size: number;
  booking: Listing[];
  airbnb: Listing[];
}

export interface ComparisonResult {
  id: string;
  input: SearchInput;
  nights: number;
  createdAt: string;
  splitGroups: SplitGroup[];
  perUnit: UnitCatalog[];
}
