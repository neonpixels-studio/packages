import {
  existsSync,
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
  while (!existsSync(current)) {
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
  const realTarget = join(
    realpathSync(deepestExistingAncestor(target)),
    relative(deepestExistingAncestor(target), target),
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
