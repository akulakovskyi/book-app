import type { Coordinate } from '../../shared/types.js';

const cache = new Map<string, Coordinate | null>();

let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function throttle(): Promise<void> {
  queue = queue
    .catch(() => undefined)
    .then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, 1100 - (now - lastCall));
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      lastCall = Date.now();
    });
  return queue as Promise<void>;
}

export async function geocodeCity(query: string): Promise<Coordinate | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  await throttle();

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'booking-app/1.0 (personal use)',
        'Accept-Language': 'en',
      },
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) {
      cache.set(key, null);
      return null;
    }
    const coord = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    cache.set(key, coord);
    return coord;
  } catch (err) {
    console.error('[geocode] failed', err);
    cache.set(key, null);
    return null;
  }
}

export async function geocodeListing(opts: {
  title?: string;
  location?: string;
  destination: string;
}): Promise<Coordinate | null> {
  const { title, location, destination } = opts;
  const cleanTitle = (title ?? '').replace(/^\s*(home|apartment|apt|flat|villa|house|townhouse|studio|room|suite|loft|cabin|guest\s*suite)s?\s+in\s+/i, '');
  const raw = [
    [title, location, destination],
    [cleanTitle, destination],
    [location, destination],
    [destination],
  ];
  const seen = new Set<string>();
  for (const parts of raw) {
    const q = parts.filter(Boolean).join(', ').trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    const coord = await geocodeCity(q);
    if (coord) return coord;
  }
  return null;
}
