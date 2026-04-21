const HOSTEL_KEYWORDS = [
  'hostel',
  'dormitory',
  'dorm',
  'shared room',
  'bed in dorm',
  'backpacker',
  'mixed dorm',
];

export function detectHostel(
  title: string,
  propertyType: string | null,
  description?: string,
): boolean {
  const haystack = `${title} ${propertyType ?? ''} ${description ?? ''}`.toLowerCase();
  return HOSTEL_KEYWORDS.some((kw) => haystack.includes(kw));
}

export function parsePrice(raw: string | null | undefined): { amount: number | null; currency: string } {
  if (!raw) return { amount: null, currency: '' };
  const text = raw.replace(/\u00a0/g, ' ').trim();
  const currencyMatch = text.match(/(?:[A-Z]{3})|[€$£₴₽¥]/);
  const currency = normalizeCurrency(currencyMatch?.[0] ?? '');
  const numeric = text.replace(/[^\d.,]/g, '');
  if (!numeric) return { amount: null, currency };
  const normalized = normalizeNumberString(numeric);
  const amount = Number.parseFloat(normalized);
  return { amount: Number.isFinite(amount) ? amount : null, currency };
}

const CURRENCY_CODES = [
  'EUR', 'USD', 'GBP', 'UAH', 'RUB', 'JPY', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK',
  'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ILS', 'AED', 'SAR', 'CNY', 'KRW', 'THB',
  'HKD', 'SGD', 'ZAR', 'MXN', 'BRL', 'INR', 'NZD', 'ISK', 'RON', 'BGN', 'HRK',
];
const PRICE_REGEX = new RegExp(
  `([€$£₴₽¥]|\\b(?:${CURRENCY_CODES.join('|')})\\b)\\s*(\\d{1,3}(?:[.,\\u00a0\\s]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)`,
  'g',
);

export function extractPrices(
  text: string,
): Array<{ amount: number; currency: string; raw: string }> {
  if (!text) return [];
  const out: Array<{ amount: number; currency: string; raw: string }> = [];
  for (const m of text.matchAll(PRICE_REGEX)) {
    const { amount, currency } = parsePrice(m[0]);
    if (amount != null && amount >= 5) {
      out.push({ amount, currency, raw: m[0] });
    }
  }
  return out;
}

export function pickPricePair(
  prices: Array<{ amount: number; currency: string }>,
  nights: number,
): { pricePerNight: number | null; priceTotal: number | null; currency: string } {
  if (prices.length === 0) return { pricePerNight: null, priceTotal: null, currency: '' };
  const sorted = [...prices].sort((a, b) => a.amount - b.amount);
  const currency = sorted[0].currency;
  if (sorted.length === 1) {
    const only = sorted[0].amount;
    if (nights > 1 && only / nights > 10) {
      return { pricePerNight: Math.round((only / nights) * 100) / 100, priceTotal: only, currency };
    }
    return { pricePerNight: only, priceTotal: only * nights, currency };
  }
  const perNight = sorted[0].amount;
  const total = sorted[sorted.length - 1].amount;
  if (total / perNight < nights * 0.5) {
    return { pricePerNight: perNight, priceTotal: perNight * nights, currency };
  }
  return { pricePerNight: perNight, priceTotal: total, currency };
}

function normalizeNumberString(raw: string): string {
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  if (lastDot === -1 && lastComma === -1) return raw;

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      return raw.replace(/\./g, '').replace(',', '.');
    }
    return raw.replace(/,/g, '');
  }

  const sep = lastDot !== -1 ? '.' : ',';
  const parts = raw.split(sep);
  const tail = parts[parts.length - 1];

  const allGroupsAreThousands =
    parts.length >= 2 &&
    tail.length === 3 &&
    parts.slice(1).every((p) => p.length === 3);

  if (allGroupsAreThousands) {
    return raw.replaceAll(sep, '');
  }

  if (sep === ',') return raw.replace(',', '.');
  return raw;
}

function normalizeCurrency(raw: string): string {
  const map: Record<string, string> = {
    '€': 'EUR',
    '$': 'USD',
    '£': 'GBP',
    '₴': 'UAH',
    '₽': 'RUB',
    '¥': 'JPY',
  };
  return map[raw] ?? raw;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 1;
}

export function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function hashKey(parts: Array<string | number | boolean | undefined>): string {
  return parts.map((p) => String(p ?? '')).join('|');
}
