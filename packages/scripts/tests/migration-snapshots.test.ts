import { describe, expect, it } from "vitest";
import { parseJournal } from "../src/migrations/journal.ts";
import {
  findBrokenChainLinks,
  findMissingSnapshotTags,
  findOrphanSnapshotFiles,
  ROOT_SNAPSHOT_PREV_ID,
} from "../src/migrations/snapshots.ts";
import {
  runCheckMigrationSnapshots,
  type CheckSnapshotsEnvironment,
} from "../src/migrations/snapshots-run.ts";
import { fakeFiles, journalJson } from "./migration-fixtures.ts";

const DIRECTORY = "db/migrations";
const META = `${DIRECTORY}/meta`;

describe("parseJournal", () => {
  const entry = (idx: number, tag: string) => ({ idx, tag, when: idx });

  it("orders entries by idx", () => {
    const entries = parseJournal(
      journalJson([entry(1, "0001_b"), entry(0, "0000_a")]),
      "journal",
    );
    expect(entries.map((item) => item.tag)).toEqual(["0000_a", "0001_b"]);
  });

  it.each([
    ["no entries array", "{}"],
    ["an idx that disagrees with the tag", journalJson([entry(3, "0001_b")])],
    ["duplicate idx", journalJson([entry(0, "0000_a"), entry(0, "0000_b")])],
    [
      "a missing when",
      JSON.stringify({ entries: [{ idx: 0, tag: "0000_a" }] }),
    ],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseJournal(raw, "journal")).toThrow();
  });
});

describe("snapshot findings", () => {
  it("finds a journal tag with no snapshot file", () => {
    expect(
      findMissingSnapshotTags(
        ["0000_a", "0001_b"],
        ["0000_snapshot.json", "_journal.json"],
      ),
    ).toEqual(["0001_b"]);
  });

  it("finds a snapshot file with no journal entry", () => {
    expect(
      findOrphanSnapshotFiles(
        ["0000_a"],
        ["0000_snapshot.json", "0007_snapshot.json", "_journal.json"],
      ),
    ).toEqual(["0007_snapshot.json"]);
  });

  it("finds a prevId that skips a snapshot and a bad root", () => {
    expect(
      findBrokenChainLinks([
        { tag: "0000_a", id: "a", prevId: ROOT_SNAPSHOT_PREV_ID },
        { tag: "0001_b", id: "b", prevId: "a" },
        { tag: "0002_c", id: "c", prevId: "a" },
      ]),
    ).toEqual([`0002_c: prevId "a" does not match "0001_b"'s id "b"`]);
    expect(
      findBrokenChainLinks([{ tag: "0000_a", id: "a", prevId: "nope" }]),
    ).toHaveLength(1);
  });
});

function snapshot(id: string, prevId: string): string {
  return JSON.stringify({ id, prevId });
}

function run(files: Record<string, string>) {
  const errors: string[] = [];
  const log: string[] = [];
  const env: CheckSnapshotsEnvironment = {
    variables: { MIGRATIONS_DIR: DIRECTORY },
    files: fakeFiles(files),
    log: (message) => log.push(message),
    error: (message) => errors.push(message),
  };
  return { env, errors, log };
}

const JOURNAL = journalJson([
  { idx: 0, tag: "0000_a", when: 1 },
  { idx: 1, tag: "0001_b", when: 2 },
]);

describe("runCheckMigrationSnapshots", () => {
  it("passes a complete, chained set", async () => {
    const { env, log } = run({
      [`${META}/_journal.json`]: JOURNAL,
      [`${META}/0000_snapshot.json`]: snapshot("a", ROOT_SNAPSHOT_PREV_ID),
      [`${META}/0001_snapshot.json`]: snapshot("b", "a"),
    });
    expect(await runCheckMigrationSnapshots([], env)).toBe(0);
    expect(log.join("\n")).toContain("All 2 journal entries");
  });

  it("fails on a missing snapshot", async () => {
    const { env, errors } = run({
      [`${META}/_journal.json`]: JOURNAL,
      [`${META}/0000_snapshot.json`]: snapshot("a", ROOT_SNAPSHOT_PREV_ID),
    });
    expect(await runCheckMigrationSnapshots([], env)).toBe(1);
    expect(errors.join("\n")).toContain("0001_b (expected 0001_snapshot.json)");
  });

  it("fails on an orphan snapshot", async () => {
    const { env, errors } = run({
      [`${META}/_journal.json`]: JOURNAL,
      [`${META}/0000_snapshot.json`]: snapshot("a", ROOT_SNAPSHOT_PREV_ID),
      [`${META}/0001_snapshot.json`]: snapshot("b", "a"),
      [`${META}/0002_snapshot.json`]: snapshot("c", "b"),
    });
    expect(await runCheckMigrationSnapshots([], env)).toBe(1);
    expect(errors.join("\n")).toContain("0002_snapshot.json");
  });

  it("fails on a broken chain", async () => {
    const { env, errors } = run({
      [`${META}/_journal.json`]: JOURNAL,
      [`${META}/0000_snapshot.json`]: snapshot("a", ROOT_SNAPSHOT_PREV_ID),
      [`${META}/0001_snapshot.json`]: snapshot("b", "zzz"),
    });
    expect(await runCheckMigrationSnapshots([], env)).toBe(1);
    expect(errors.join("\n")).toContain("Broken migration snapshot chain");
  });

  it("fails on an empty journal and on a snapshot without ids", async () => {
    const empty = run({ [`${META}/_journal.json`]: journalJson([]) });
    expect(await runCheckMigrationSnapshots([], empty.env)).toBe(1);

    const noIds = run({
      [`${META}/_journal.json`]: journalJson([
        { idx: 0, tag: "0000_a", when: 1 },
      ]),
      [`${META}/0000_snapshot.json`]: "{}",
    });
    expect(await runCheckMigrationSnapshots([], noIds.env)).toBe(1);
    expect(noIds.errors.join("\n")).toContain('missing a string "id"');
  });
});
