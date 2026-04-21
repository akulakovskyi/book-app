import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import type { ComparisonResult, Listing, SearchInput } from '../../shared/types.js';
import { hashKey } from '../scrapers/util.js';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  mkdirSync(config.dataDir, { recursive: true });
  const dbPath = join(config.dataDir, 'cache.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_cache (
      key TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      destination TEXT NOT NULL,
      checkin TEXT NOT NULL,
      checkout TEXT NOT NULL,
      guests INTEGER NOT NULL,
      currency TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      destination TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comparisons_created ON comparisons(created_at DESC);
  `);

  dbInstance = db;
  return db;
}

export function scrapeCacheKey(source: string, input: SearchInput, guests: number, page = 1): string {
  return hashKey([
    source,
    input.destination.toLowerCase().trim(),
    input.checkIn,
    input.checkOut,
    guests,
    input.currency ?? config.currency,
    input.excludeHostels ? 1 : 0,
    page,
  ]);
}

export function readScrapeCache(key: string): Listing[] | null {
  const db = getDb();
  const row = db.prepare('SELECT payload, created_at FROM scrape_cache WHERE key = ?').get(key) as
    | { payload: string; created_at: number }
    | undefined;
  if (!row) return null;
  const ageMinutes = (Date.now() - row.created_at) / 60_000;
  if (ageMinutes > config.cacheTtlMinutes) return null;
  try {
    return JSON.parse(row.payload) as Listing[];
  } catch {
    return null;
  }
}

export function writeScrapeCache(
  key: string,
  source: string,
  input: SearchInput,
  guests: number,
  listings: Listing[],
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO scrape_cache
     (key, source, destination, checkin, checkout, guests, currency, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    key,
    source,
    input.destination,
    input.checkIn,
    input.checkOut,
    guests,
    input.currency ?? config.currency,
    JSON.stringify(listings),
    Date.now(),
  );
}

export function saveComparisonRow(result: ComparisonResult): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO comparisons (id, created_at, destination, payload) VALUES (?, ?, ?, ?)`,
  ).run(result.id, result.createdAt, result.input.destination, JSON.stringify(result));
}

export function loadComparisonRow(id: string): ComparisonResult | undefined {
  const db = getDb();
  const row = db.prepare('SELECT payload FROM comparisons WHERE id = ?').get(id) as
    | { payload: string }
    | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.payload) as ComparisonResult;
  } catch {
    return undefined;
  }
}

export function listComparisonRows(limit = 50): ComparisonResult[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT payload FROM comparisons ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{ payload: string }>;
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload) as ComparisonResult;
      } catch {
        return null;
      }
    })
    .filter((r): r is ComparisonResult => r !== null);
}
