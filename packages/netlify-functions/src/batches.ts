export type BatchFailure<Item> = { item: Item; error: unknown };

export type BatchResult<Item> = {
  processed: number;
  failures: BatchFailure<Item>[];
  hasMore: boolean;
};

export type RunInBatchesOptions<Item> = {
  loadBatch: (limit: number) => Promise<Item[]>;
  handle: (item: Item) => Promise<void>;
  batchSize: number;
  timeBudgetMs: number;
};

async function handleBatch<Item>(
  batch: Item[],
  handle: (item: Item) => Promise<void>,
): Promise<BatchFailure<Item>[]> {
  const failures: BatchFailure<Item>[] = [];
  for (const item of batch) {
    try {
      await handle(item);
    } catch (error) {
      failures.push({ item, error });
    }
  }
  return failures;
}

// Loads and handles batches until loadBatch returns nothing or the time budget
// is spent. The budget is checked between batches. One failed item does not
// stop its batch, but a batch with failures ends the run (hasMore true): a
// loader that still returns the failed items would otherwise repeat them
// until the budget runs out.
export async function runInBatches<Item>(
  options: RunInBatchesOptions<Item>,
): Promise<BatchResult<Item>> {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new RangeError("runInBatches: batchSize must be a positive integer.");
  }
  const deadline = Date.now() + options.timeBudgetMs;
  const result: BatchResult<Item> = {
    processed: 0,
    failures: [],
    hasMore: false,
  };
  while (Date.now() < deadline) {
    const batch = await options.loadBatch(options.batchSize);
    if (batch.length === 0) {
      return result;
    }
    const failures = await handleBatch(batch, options.handle);
    result.processed += batch.length - failures.length;
    result.failures.push(...failures);
    if (failures.length > 0) {
      result.hasMore = true;
      return result;
    }
  }
  result.hasMore = true;
  return result;
}
