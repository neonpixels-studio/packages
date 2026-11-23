import { journalTagPrefix } from "./journal.ts";

// A snapshot file must exist for every journal tag and chain back to the one
// before it. Otherwise the next `drizzle-kit generate` diffs the schema
// against a stale base state and produces a bogus or incomplete migration.

// drizzle-kit seeds the very first snapshot's prevId with this all-zero UUID;
// there is no earlier snapshot for it to chain to.
export const ROOT_SNAPSHOT_PREV_ID = "00000000-0000-0000-0000-000000000000";

const SNAPSHOT_FILENAME_PATTERN = /^(\d{4})_snapshot\.json$/;

export interface SnapshotChainLink {
  tag: string;
  id: string;
  prevId: string;
}

function snapshotFilePrefix(filename: string): string | undefined {
  return filename.match(SNAPSHOT_FILENAME_PATTERN)?.[1];
}

export function snapshotFilenameForTag(tag: string): string | undefined {
  const prefix = journalTagPrefix(tag);
  return prefix ? `${prefix}_snapshot.json` : undefined;
}

function prefixesOf<Item>(
  items: Item[],
  prefixOf: (item: Item) => string | undefined,
): Set<string> {
  return new Set(
    items
      .map(prefixOf)
      .filter((prefix): prefix is string => prefix !== undefined),
  );
}

export function findMissingSnapshotTags(
  journalTags: string[],
  snapshotFilenames: string[],
): string[] {
  const existing = prefixesOf(snapshotFilenames, snapshotFilePrefix);
  return journalTags.filter((tag) => {
    const prefix = journalTagPrefix(tag);
    return !prefix || !existing.has(prefix);
  });
}

// The inverse gap: a snapshot left on disk with no journal entry (a bad merge
// dropped the entry but kept the file). `drizzle-kit generate` diffs against
// the highest-numbered snapshot regardless of the journal, so an orphan is as
// dangerous as a missing snapshot.
export function findOrphanSnapshotFiles(
  journalTags: string[],
  snapshotFilenames: string[],
): string[] {
  const journalPrefixes = prefixesOf(journalTags, journalTagPrefix);
  return snapshotFilenames.filter((filename) => {
    const prefix = snapshotFilePrefix(filename);
    return prefix !== undefined && !journalPrefixes.has(prefix);
  });
}

// A snapshot existing is not enough: its `prevId` can point past the snapshot
// before it and silently skip migrations. Walks the chain in journal order
// and reports any link whose `prevId` is not the previous snapshot's id (or,
// for the first, drizzle's root sentinel).
export function findBrokenChainLinks(
  orderedSnapshots: SnapshotChainLink[],
): string[] {
  return orderedSnapshots.flatMap((snapshot, index) => {
    const previous = orderedSnapshots[index - 1];
    const expectedPrevId = previous?.id ?? ROOT_SNAPSHOT_PREV_ID;
    if (snapshot.prevId === expectedPrevId) {
      return [];
    }
    if (!previous) {
      return [
        `${snapshot.tag}: prevId "${snapshot.prevId}" is not the root sentinel "${ROOT_SNAPSHOT_PREV_ID}"`,
      ];
    }
    return [
      `${snapshot.tag}: prevId "${snapshot.prevId}" does not match "${previous.tag}"'s id "${previous.id}"`,
    ];
  });
}
