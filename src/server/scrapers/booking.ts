import type { Page } from 'playwright';
import { newContext } from './browser.js';
import { config } from '../config.js';
import { detectHostel, extractPrices, nightsBetween, pickPricePair, uniqueBy } from './util.js';
import { readScrapeCache, scrapeCacheKey, writeScrapeCache } from '../cache/db.js';
import type { Listing, SearchInput } from '../../shared/types.js';

export async function searchBooking(
  input: SearchInput,
  unitGuests: number,
  pageNum = 1,
): Promise<Listing[]> {
  const cacheKey = scrapeCacheKey('booking', input, unitGuests, pageNum);
  const cached = readScrapeCache(cacheKey);
  if (cached) return cached;

  const context = await newContext();
  const page = await context.newPage();

  try {
    const url = buildBookingUrl(input, unitGuests, pageNum);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.requestTimeoutMs });
    await dismissCookieBanner(page);

    await page.waitForSelector('[data-testid="property-card"]', {
      timeout: config.requestTimeoutMs,
    }).catch(() => undefined);

    await autoScroll(page, 4);

    const nights = nightsBetween(input.checkIn, input.checkOut);
    const coords = await extractCoordinates(page);
    const listings = await extractListings(page, unitGuests, nights, input.currency ?? config.currency, coords);
    const filtered = filterListings(listings, input.excludeHostels);
    writeScrapeCache(cacheKey, 'booking', input, unitGuests, filtered);
    return filtered;
  } finally {
    await context.close();
  }
}

function buildBookingUrl(input: SearchInput, unitGuests: number, pageNum = 1): string {
  const params = new URLSearchParams({
    ss: input.destination,
    checkin: input.checkIn,
    checkout: input.checkOut,
    group_adults: String(unitGuests),
    group_children: '0',
    no_rooms: '1',
    selected_currency: input.currency ?? config.currency,
    lang: config.language,
  });
  if (pageNum > 1) {
    params.set('offset', String((pageNum - 1) * 25));
  }
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button[aria-label*="Accept" i]',
    'button:has-text("Accept")',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => undefined);
      await page.waitForTimeout(300);
      return;
    }
  }
}

async function autoScroll(page: Page, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(600);
  }
}

async function extractCoordinates(page: Page): Promise<Record<string, { lat: number; lon: number }>> {
  return await page.evaluate(() => {
    const out: Record<string, { lat: number; lon: number }> = {};
    const scripts = Array.from(document.querySelectorAll('script'));
    const patterns = [
      /"hotel_id":\s*(\d+)[^{}]*?"latitude":\s*(-?[\d.]+)[^{}]*?"longitude":\s*(-?[\d.]+)/g,
      /"id":\s*(\d+)[^{}]*?"latitude":\s*(-?[\d.]+)[^{}]*?"longitude":\s*(-?[\d.]+)/g,
    ];
    for (const s of scripts) {
      const text = s.textContent ?? '';
      if (!text.includes('latitude')) continue;
      for (const re of patterns) {
        for (const m of text.matchAll(re)) {
          const id = m[1];
          const lat = parseFloat(m[2]);
          const lon = parseFloat(m[3]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (lat === 0 && lon === 0) continue;
          if (!out[id]) out[id] = { lat, lon };
        }
      }
    }
    return out;
  });
}

async function extractListings(
  page: Page,
  unitGuests: number,
  nights: number,
  fallbackCurrency: string,
  coords: Record<string, { lat: number; lon: number }>,
): Promise<Listing[]> {
  const raw = await page.$$eval(
    '[data-testid="property-card"]',
    (cards) =>
      cards.map((card) => {
        const titleEl = card.querySelector<HTMLElement>('[data-testid="title"]');
        const linkEl = card.querySelector<HTMLAnchorElement>('a[data-testid="title-link"]')
          ?? card.querySelector<HTMLAnchorElement>('a[href*="/hotel/"]');
        const imgEl = card.querySelector<HTMLImageElement>('img');
        const priceEl = card.querySelector<HTMLElement>('[data-testid="price-and-discounted-price"]')
          ?? card.querySelector<HTMLElement>('[data-testid="availability-rate-information"]');
        const reviewScoreEl = card.querySelector<HTMLElement>('[data-testid="review-score"]');
        const locationEl = card.querySelector<HTMLElement>('[data-testid="address"]');
        const unitConfigEl = card.querySelector<HTMLElement>('[data-testid="property-card-unit-configuration"]');
        const recommendedUnitsEl = card.querySelector<HTMLElement>('[data-testid="recommended-units"]');

        const id = card.getAttribute('data-hotelid')
          ?? linkEl?.getAttribute('data-hotelid')
          ?? linkEl?.href
          ?? crypto.randomUUID();

        return {
          id,
          title: titleEl?.textContent?.trim() ?? '',
          url: linkEl?.href ?? '',
          image: imgEl?.src ?? null,
          priceText: priceEl?.textContent?.trim() ?? '',
          fullText: (card as HTMLElement).innerText ?? card.textContent ?? '',
          reviewText: reviewScoreEl?.textContent?.trim() ?? '',
          location: locationEl?.textContent?.trim() ?? null,
          unitConfigText: unitConfigEl?.textContent?.trim() ?? '',
          recommendedText: recommendedUnitsEl?.textContent?.trim() ?? '',
        };
      }),
  );

  const normalized: Listing[] = raw
    .filter((r) => r.title && r.url)
    .map((r) => {
      const specific = extractPrices(r.priceText);
      const fallback = specific.length ? specific : extractPrices(r.fullText);
      const { pricePerNight, priceTotal, currency } = pickPricePair(fallback, nights);

      const { rating, reviewsCount } = parseBookingReview(r.reviewText);
      const beds = parseInt(/(\d+)\s*bed/i.exec(r.unitConfigText)?.[1] ?? '', 10);
      const bedrooms = parseInt(/(\d+)\s*bedroom/i.exec(r.unitConfigText)?.[1] ?? '', 10);

      const rawId = String(r.id).replace(/^.*\//, '').split('?')[0];
      const coord = coords[rawId] ?? null;
      return {
        id: `booking:${r.id}`,
        source: 'booking' as const,
        title: r.title,
        url: r.url,
        images: r.image ? [r.image] : [],
        pricePerNight,
        priceTotal,
        currency: currency || fallbackCurrency,
        rating,
        reviewsCount,
        capacity: unitGuests,
        beds: Number.isFinite(beds) ? beds : null,
        bedrooms: Number.isFinite(bedrooms) ? bedrooms : null,
        propertyType: r.recommendedText || null,
        isHostel: detectHostel(r.title, r.recommendedText, r.unitConfigText),
        location: r.location,
        amenities: [],
        coordinate: coord,
      };
    });

  return uniqueBy(normalized, (l) => l.id);
}

function parseBookingReview(text: string): { rating: number | null; reviewsCount: number | null } {
  if (!text) return { rating: null, reviewsCount: null };
  const ratingMatch = text.match(/(\d+[.,]\d+)/);
  const countMatch = text.match(/([\d,.]+)\s*review/i);
  const rating = ratingMatch ? Number.parseFloat(ratingMatch[1].replace(',', '.')) : null;
  const reviewsCount = countMatch ? Number.parseInt(countMatch[1].replace(/[^\d]/g, ''), 10) : null;
  return {
    rating: Number.isFinite(rating ?? NaN) ? rating : null,
    reviewsCount: Number.isFinite(reviewsCount ?? NaN) ? reviewsCount : null,
  };
}

function filterListings(items: Listing[], excludeHostels: boolean | undefined): Listing[] {
  if (!excludeHostels) return items;
  return items.filter((l) => !l.isHostel);
}
