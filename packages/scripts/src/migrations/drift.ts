import type { JournalMigration } from "./journal.ts";

// drizzle picks which migrations to run with a timestamp watermark and never
// compares hashes:
//
//   if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
//
// So a journal `when` raised after its migration was applied, or a migration
// that lands out of order, makes drizzle re-run applied DDL or skip a
// migration forever. Neither is visible until a deploy fails.

export interface RecordedMigration {
  hash: string;
  created_at: string | number;
}

export type DriftKind = "unknown-hash" | "timestamp-drift" | "silently-skipped";

export interface DriftFinding {
  kind: DriftKind;
  detail: string;
}

const HASH_PREVIEW_LENGTH = 12;

function preview(hash: string): string {
  return `${hash.slice(0, HASH_PREVIEW_LENGTH)}...`;
}

function findWatermark(recorded: RecordedMigration[]): number {
  return recorded.reduce(
    (highest, row) => Math.max(highest, Number(row.created_at)),
    0,
  );
}

function findUnknownHashes(
  recorded: RecordedMigration[],
  journalByHash: Map<string, JournalMigration>,
): DriftFinding[] {
  return recorded
    .filter((row) => !journalByHash.has(row.hash))
    .map((row) => ({
      kind: "unknown-hash" as const,
      detail: `Recorded migration ${preview(row.hash)} is not in the journal. A migration file was deleted or its contents were edited after being applied.`,
    }));
}

// Only a journal timestamp raised above the watermark makes drizzle re-run
// applied DDL; one lowered to or below it is harmless, so it is not reported.
function findTimestampDrift(
  recorded: RecordedMigration[],
  journalByHash: Map<string, JournalMigration>,
): DriftFinding[] {
  const watermark = findWatermark(recorded);
  return recorded.flatMap((row) => {
    const entry = journalByHash.get(row.hash);
    if (!entry || entry.folderMillis <= watermark) {
      return [];
    }
    return [
      {
        kind: "timestamp-drift" as const,
        detail: `Migration ${preview(entry.hash)} is recorded as applied at ${row.created_at} but the journal says ${entry.folderMillis}, above the watermark ${watermark}. The journal was rewritten after this migration ran; drizzle will re-apply already-applied DDL.`,
      },
    ];
  });
}

function findSilentlySkipped(
  recorded: RecordedMigration[],
  journal: JournalMigration[],
): DriftFinding[] {
  const recordedHashes = new Set(recorded.map((row) => row.hash));
  const watermark = findWatermark(recorded);
  return journal
    .filter((migration) => !recordedHashes.has(migration.hash))
    .filter((migration) => migration.folderMillis <= watermark)
    .map((migration) => ({
      kind: "silently-skipped" as const,
      detail: `Migration ${preview(migration.hash)} (${migration.folderMillis}) was never applied but sits at or below the watermark ${watermark}. drizzle will never run it.`,
    }));
}

export function findMigrationDrift(
  recorded: RecordedMigration[],
  journal: JournalMigration[],
): DriftFinding[] {
  const journalByHash = new Map(
    journal.map((migration) => [migration.hash, migration]),
  );
  return [
    ...findUnknownHashes(recorded, journalByHash),
    ...findTimestampDrift(recorded, journalByHash),
    ...findSilentlySkipped(recorded, journal),
  ];
}
