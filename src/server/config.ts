import 'dotenv/config';

export const config = {
  currency: process.env['CURRENCY'] ?? 'EUR',
  language: process.env['LANGUAGE'] ?? 'en-us',
  headless: process.env['HEADLESS'] !== '0',
  cacheTtlMinutes: Number(process.env['CACHE_TTL_MINUTES'] ?? 180),
  dataDir: process.env['DATA_DIR'] ?? 'data',
  requestTimeoutMs: Number(process.env['REQUEST_TIMEOUT_MS'] ?? 60_000),
} as const;
