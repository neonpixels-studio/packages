import { readdirSync, readFileSync } from "node:fs";

/** The only door to the disk, so tests can replace it. */
export interface MigrationFiles {
  readText(path: string): string;
  listNames(directory: string): string[];
}

export const systemFiles: MigrationFiles = {
  readText: (path) => readFileSync(path, "utf8"),
  listNames: (directory) => readdirSync(directory),
};
