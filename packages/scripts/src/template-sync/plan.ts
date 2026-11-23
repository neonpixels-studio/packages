import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readRepositoryFile } from "./files.ts";
import {
  BASE_TEMPLATE_DIRECTORY,
  PACKAGE_FIELDS_TEMPLATE,
  PACKAGE_JSON,
  TEMPLATE_FILES,
  type Stack,
} from "./manifest.ts";
import { applyPackageFields } from "./package-fields.ts";
import { preserveSections } from "./markers.ts";

export interface PlannedChange {
  path: string;
  /** The repository's current text, or null when the file does not exist yet. */
  before: string | null;
  after: string;
}

/** A stack's own variant wins; otherwise the base template is used. */
function readTemplate(
  templatesRoot: string,
  stack: Stack,
  path: string,
): string {
  for (const directory of [stack, BASE_TEMPLATE_DIRECTORY]) {
    const candidate = join(templatesRoot, directory, path);
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8");
    }
  }
  throw new Error(`No template for ${path} (stack ${stack}).`);
}

function planCopiedFile(
  root: string,
  templatesRoot: string,
  stack: Stack,
  path: string,
): PlannedChange {
  const before = readRepositoryFile(root, path);
  const template = readTemplate(templatesRoot, stack, path);
  return { path, before, after: preserveSections(template, before, path) };
}

function planPackageJson(
  root: string,
  templatesRoot: string,
  stack: Stack,
): PlannedChange {
  const before = readRepositoryFile(root, PACKAGE_JSON);
  if (before === null) {
    throw new Error(
      `${PACKAGE_JSON} not found in ${root}. Run this from the repository root.`,
    );
  }
  const fields = readTemplate(templatesRoot, stack, PACKAGE_FIELDS_TEMPLATE);
  return {
    path: PACKAGE_JSON,
    before,
    after: applyPackageFields(before, fields),
  };
}

/** Every manifest file, in manifest order, whether or not it differs. */
export function planSync(
  root: string,
  templatesRoot: string,
  stack: Stack,
): PlannedChange[] {
  return [
    ...TEMPLATE_FILES.map((path) =>
      planCopiedFile(root, templatesRoot, stack, path),
    ),
    planPackageJson(root, templatesRoot, stack),
  ];
}
