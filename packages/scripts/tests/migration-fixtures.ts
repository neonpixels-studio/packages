import { createHash } from "node:crypto";
import type { MigrationFiles } from "../src/migrations/filesystem.ts";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** An in-memory migrations directory keyed by path. */
export function fakeFiles(files: Record<string, string>): MigrationFiles {
  return {
    readText(path) {
      const text = files[path];
      if (text === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return text;
    },
    listNames(directory) {
      const prefix = `${directory}/`;
      return Object.keys(files)
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((name) => !name.includes("/"));
    },
  };
}

export function journalJson(
  entries: { idx: number; tag: string; when: number }[],
): string {
  return JSON.stringify({ version: "7", dialect: "postgresql", entries });
}
