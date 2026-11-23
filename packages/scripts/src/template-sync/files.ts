import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

function deepestExistingAncestor(path: string): string {
  let current = path;
  while (lstatSync(current, { throwIfNoEntry: false }) === undefined) {
    current = dirname(current);
  }
  return current;
}

/**
 * Resolves a repository-relative path and throws unless it stays inside the
 * root, following symlinks, so a linked directory cannot lead a write out of
 * the repository.
 */
export function resolveInsideRoot(root: string, path: string): string {
  const target = resolve(root, path);
  if (!isInside(resolve(root), target)) {
    throw new Error(`Refusing to touch ${path}: it is outside the repository.`);
  }
  if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error(`Refusing to touch ${path}: it is a symbolic link.`);
  }
  const existingAncestor = deepestExistingAncestor(target);
  const realTarget = join(
    realpathSync(existingAncestor),
    relative(existingAncestor, target),
  );
  if (!isInside(realpathSync(root), realTarget)) {
    throw new Error(
      `Refusing to touch ${path}: it resolves outside the repository.`,
    );
  }
  return target;
}

export function readRepositoryFile(root: string, path: string): string | null {
  const target = resolveInsideRoot(root, path);
  return existsSync(target) ? readFileSync(target, "utf8") : null;
}

export function writeRepositoryFile(
  root: string,
  path: string,
  text: string,
): void {
  const target = resolveInsideRoot(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}
