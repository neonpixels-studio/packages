export interface PinningViolation {
  file: string;
  line: number;
  reference: string;
  reason: string;
}

const USES_PATTERN =
  /^\s*(?:-\s+)?(?:\{\s*)?["']?uses["']?:\s*(?:'([^']*)'|"([^"]*)"|([^\s,}]+))(.*)$/;
const BARE_USES_PATTERN = /^\s*(?:-\s+)?(?:\{\s*)?["']?uses["']?:\s*(?:#.*)?$/;
const COMMIT_REFERENCE_PATTERN = /^[^@\s]+@[0-9a-f]{40}$/;
const DOCKER_DIGEST_PATTERN = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/;
const VERSION_COMMENT_PATTERN = /#\s*v?\d/;
const DOCKER_PREFIX = "docker://";

function isLocalReference(reference: string): boolean {
  return reference.startsWith("./");
}

function isPinned(reference: string): boolean {
  if (reference.startsWith(DOCKER_PREFIX)) {
    return DOCKER_DIGEST_PATTERN.test(reference);
  }
  return COMMIT_REFERENCE_PATTERN.test(reference);
}

function pinningProblem(reference: string, trailer: string): string | null {
  if (!isPinned(reference)) {
    return reference.startsWith(DOCKER_PREFIX)
      ? "is not pinned to a @sha256 digest"
      : "is not pinned to a full commit SHA";
  }
  if (!VERSION_COMMENT_PATTERN.test(trailer)) {
    return "has no trailing version comment (for example `# v4.1.0`)";
  }
  return null;
}

function violationForLine(
  file: string,
  text: string,
  index: number,
): PinningViolation | null {
  if (BARE_USES_PATTERN.test(text)) {
    return {
      file,
      line: index + 1,
      reference: "uses:",
      reason: "has its value on a following line, put it on the same line",
    };
  }
  const match = USES_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  const reference = match[1] ?? match[2] ?? match[3] ?? "";
  if (reference === "" || isLocalReference(reference)) {
    return null;
  }
  const reason = pinningProblem(reference, match[4] ?? "");
  return reason ? { file, line: index + 1, reference, reason } : null;
}

/** Finds every `uses:` in one workflow or composite action file that is not pinned. */
export function findPinningViolations(
  file: string,
  content: string,
): PinningViolation[] {
  return content
    .split(/\r?\n/)
    .map((text, index) => violationForLine(file, text, index))
    .filter((violation): violation is PinningViolation => violation !== null);
}

export function formatViolation(violation: PinningViolation): string {
  return `${violation.file}:${violation.line} ${violation.reference} ${violation.reason}`;
}
