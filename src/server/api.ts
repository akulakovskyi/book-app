import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { runComparison } from './logic/compare.js';
import { normalizeDestination } from './logic/normalize-destination.js';
import { getComparison, listComparisons, saveComparison } from './cache/store.js';
import { renderReportHtml } from './report/template.js';
import { searchBooking } from './scrapers/booking.js';
import { searchAirbnb } from './scrapers/airbnb.js';
import { geocodeCity, geocodeListing } from './logic/geocode.js';
import type { Listing } from '../shared/types.js';

const searchSchema = z.object({
  destination: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalGuests: z.number().int().min(1).max(32),
  excludeHostels: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  maxSplitUnits: z.number().int().min(1).max(8).optional(),
  minUnitSize: z.number().int().min(1).max(10).optional(),
});

const moreSchema = z.object({
  size: z.number().int().min(1).max(12),
  source: z.enum(['booking', 'airbnb']),
  page: z.number().int().min(2).max(5),
});

export function createApiRouter(): Router {
  const router = Router();

  router.post('/search', async (req: Request, res: Response) => {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues });
      return;
    }
    try {
      const normalized = {
        ...parsed.data,
        destination: normalizeDestination(parsed.data.destination),
      };
      const result = await runComparison(normalized);
      saveComparison(result);
      res.json(result);
    } catch (err) {
      console.error('[api /search] failed', err);
      res.status(500).json({ error: 'search_failed', message: (err as Error).message });
    }
  });

  router.post('/comparison/:id/more', async (req, res) => {
    const r = getComparison(req.params['id']);
    if (!r) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const parsed = moreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues });
      return;
    }
    const { size, source, page } = parsed.data;
    try {
      const fn = source === 'booking' ? searchBooking : searchAirbnb;
      const fetched = await fn(r.input, size, page);
      const existingIds = new Set(
        r.perUnit
          .find((u) => u.size === size)
          ?.[source]
          .map((l: Listing) => l.id) ?? [],
      );
      const fresh = fetched.filter((l) => !existingIds.has(l.id) && l.priceTotal != null);

      const unit = r.perUnit.find((u) => u.size === size);
      if (unit) {
        unit[source] = [...unit[source], ...fresh];
        saveComparison(r);
      }

      res.json({ size, source, page, added: fresh.length, listings: fresh });
    } catch (err) {
      console.error('[api /more] failed', err);
      res.status(500).json({ error: 'fetch_failed', message: (err as Error).message });
    }
  });

  router.get('/comparison/:id', (req, res) => {
    const r = getComparison(req.params['id']);
    if (!r) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(r);
  });

  router.get('/comparisons', (_req, res) => {
    res.json(listComparisons().map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      input: c.input,
      topSplit: c.splitGroups[0]?.alternatives[0] ?? null,
    })));
  });

  router.get('/geocode', async (req, res) => {
    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
    if (!q || q.length > 200) {
      res.status(400).json({ error: 'invalid_query' });
      return;
    }
    const coord = await geocodeCity(q);
    if (!coord) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(coord);
  });

  router.get('/geocode-listing', async (req, res) => {
    const title = typeof req.query['title'] === 'string' ? req.query['title'].slice(0, 200) : '';
    const location = typeof req.query['location'] === 'string' ? req.query['location'].slice(0, 200) : '';
    const destination = typeof req.query['destination'] === 'string' ? req.query['destination'].slice(0, 120) : '';
    if (!destination) {
      res.status(400).json({ error: 'invalid_query' });
      return;
    }
    const coord = await geocodeListing({ title, location, destination });
    if (!coord) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(coord);
  });

  router.get('/report/:id', (req, res) => {
    const r = getComparison(req.params['id']);
    if (!r) {
      res.status(404).send('Not found');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReportHtml(r));
  });

  return router;
}
