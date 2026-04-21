import type { ComparisonResult } from '../../shared/types.js';
import { listComparisonRows, loadComparisonRow, saveComparisonRow } from './db.js';

export function saveComparison(result: ComparisonResult): void {
  saveComparisonRow(result);
}

export function getComparison(id: string): ComparisonResult | undefined {
  return loadComparisonRow(id);
}

export function listComparisons(): ComparisonResult[] {
  return listComparisonRows();
}
