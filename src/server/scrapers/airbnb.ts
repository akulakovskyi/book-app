import type { Page } from 'playwright';
import { newContext } from './browser.js';
import { config } from '../config.js';
import { detectHostel, extractPrices, nightsBetween, pickPricePair, uniqueBy } from './util.js';
import { readScrapeCache, scrapeCacheKey, writeScrapeCache } from '../cache/db.js';
import type { Listing, SearchInput } from '../../shared/types.js';

export async function searchAirbnb(
  input: SearchInput,
  unitGuests: number,
  pageNum = 1,
): Promise<Listing[]> {
  const cacheKey = scrapeCacheKey('airbnb', input, unitGuests, pageNum);
  const cached = readScrapeCache(cacheKey);
  if (cached) return cached;

  const context = await newContext();
  const page = await context.newPage();

  try {
    const url = buildAirbnbUrl(input, unitGuests, pageNum);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.requestTimeoutMs });
    await dismissModal(page);

    await page.waitForSelector('[itemprop="itemListElement"], [data-testid="card-container"]', {
      timeout: config.requestTimeoutMs,
    }).catch(() => undefined);

    await autoScroll(page, 3);

    const nights = nightsBetween(input.checkIn, input.checkOut);
    const listings = await extractListings(page, unitGuests, nights, input.currency ?? config.currency);
    const filtered = filterListings(listings, input.excludeHostels);
    writeScrapeCache(cacheKey, 'airbnb', input, unitGuests, filtered);
    return filtered;
  } finally {
    await context.close();
  }
}

function buildAirbnbUrl(input: SearchInput, unitGuests: number, pageNum = 1): string {
  const slug = encodeURIComponent(input.destination);
  const params = new URLSearchParams({
    checkin: input.checkIn,
    checkout: input.checkOut,
    adults: String(unitGuests),
    currency: input.currency ?? config.currency,
  });
  if (pageNum > 1) {
    params.set('items_offset', String((pageNum - 1) * 18));
    params.set('section_offset', String(pageNum - 1));
  }
  return `https://www.airbnb.com/s/${slug}/homes?${params.toString()}`;
}

async function dismissModal(page: Page): Promise<void> {
  const selectors = [
    'button[aria-label="Close"]',
    'button[data-testid="modal-container-close-button"]',
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
    await page.waitForTimeout(700);
  }
}

async function extractListings(
  page: Page,
  unitGuests: number,
  nights: number,
  fallbackCurrency: string,
): Promise<Listing[]> {
  const raw = await page.$$eval(
    '[itemprop="itemListElement"], [data-testid="card-container"]',
    (cards) =>
      cards.map((card) => {
        const anchor = card.querySelector<HTMLAnchorElement>('a[href*="/rooms/"]');
        const titleEl = card.querySelector<HTMLElement>('[data-testid="listing-card-title"]')
          ?? card.querySelector<HTMLElement>('meta[itemprop="name"]')
          ?? card.querySelector<HTMLElement>('div[aria-hidden="true"]');
        const subtitleEls = card.querySelectorAll<HTMLElement>('[data-testid="listing-card-subtitle"]');
        const ratingEl = card.querySelector<HTMLElement>('[aria-label*="out of 5"], span.ru0q88m');
        const images = Array.from(card.querySelectorAll<HTMLImageElement>('img'))
          .map((img) => img.src)
          .filter(Boolean);

        const subtitleTexts = Array.from(subtitleEls).map((s) => s.textContent?.trim() ?? '');
        const fullText = (card as HTMLElement).innerText ?? card.textContent ?? '';

        const href = anchor?.href ?? '';
        const idMatch = href.match(/\/rooms\/(\d+)/);

        return {
          id: idMatch?.[1] ?? (href || crypto.randomUUID()),
          title: titleEl?.getAttribute('content') ?? titleEl?.textContent?.trim() ?? '',
          url: href,
          images,
          subtitleTexts,
          fullText,
          ratingText: ratingEl?.getAttribute('aria-label') ?? ratingEl?.textContent?.trim() ?? '',
        };
      }),
  );

  const normalized: Listing[] = raw
    .filter((r) => r.title && r.url)
    .map((r) => {
      const prices = extractPrices(r.fullText);
      const { pricePerNight, priceTotal, currency } = pickPricePair(prices, nights);

      const { rating, reviewsCount } = parseAirbnbRating(r.ratingText);
      const propertyType = r.subtitleTexts[0] ?? null;
      const beds = parseInt(/(\d+)\s*bed/i.exec(r.subtitleTexts.join(' '))?.[1] ?? '', 10);
      const bedrooms = parseInt(/(\d+)\s*bedroom/i.exec(r.subtitleTexts.join(' '))?.[1] ?? '', 10);

      return {
        id: `airbnb:${r.id}`,
        source: 'airbnb' as const,
        title: r.title,
        url: r.url,
        images: r.images.slice(0, 5),
        pricePerNight,
        priceTotal,
        currency: currency || fallbackCurrency,
        rating,
        reviewsCount,
        capacity: unitGuests,
        beds: Number.isFinite(beds) ? beds : null,
        bedrooms: Number.isFinite(bedrooms) ? bedrooms : null,
        propertyType,
        isHostel: detectHostel(r.title, propertyType, r.subtitleTexts.join(' ')),
        location: r.subtitleTexts[1] ?? null,
        amenities: [],
      };
    });

  return uniqueBy(normalized, (l) => l.id);
}

function parseAirbnbRating(text: string): { rating: number | null; reviewsCount: number | null } {
  if (!text) return { rating: null, reviewsCount: null };
  const ratingMatch = text.match(/(\d+[.,]\d+)\s*(?:out of 5)?/);
  const reviewsMatch = text.match(/(\d+)\s*review/i);
  const rating = ratingMatch ? Number.parseFloat(ratingMatch[1].replace(',', '.')) : null;
  const reviewsCount = reviewsMatch ? Number.parseInt(reviewsMatch[1], 10) : null;
  return {
    rating: Number.isFinite(rating ?? NaN) ? rating : null,
    reviewsCount: Number.isFinite(reviewsCount ?? NaN) ? reviewsCount : null,
  };
}

function filterListings(items: Listing[], excludeHostels: boolean | undefined): Listing[] {
  if (!excludeHostels) return items;
  return items.filter((l) => !l.isHostel);
}
