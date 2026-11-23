const BEGIN_PATTERN = /^\s*# np-sync:begin ([\w-]+)\s*$/;
const END_PATTERN = /^\s*# np-sync:end ([\w-]+)\s*$/;

interface Section {
  name: string;
  begin: number;
  end: number;
}

function findSections(lines: string[], label: string): Section[] {
  const sections: Section[] = [];
  let openName: string | null = null;
  let openLine = 0;
  for (const [index, line] of lines.entries()) {
    const beginName = BEGIN_PATTERN.exec(line)?.[1];
    const endName = END_PATTERN.exec(line)?.[1];
    if (beginName && openName !== null) {
      throw new Error(
        `${label}: section "${beginName}" starts inside section "${openName}".`,
      );
    }
    if (beginName) {
      openName = beginName;
      openLine = index;
    }
    if (endName && endName !== openName) {
      throw new Error(`${label}: unmatched end marker for "${endName}".`);
    }
    if (endName && openName !== null) {
      sections.push({ name: openName, begin: openLine, end: index });
      openName = null;
    }
  }
  if (openName !== null) {
    throw new Error(`${label}: section "${openName}" is never closed.`);
  }
  return sections;
}

function assertUniqueNames(sections: Section[], label: string): void {
  const seen = new Set<string>();
  for (const section of sections) {
    if (seen.has(section.name)) {
      throw new Error(`${label}: section "${section.name}" appears twice.`);
    }
    seen.add(section.name);
  }
}

function readSections(text: string, label: string): Map<string, string[]> {
  const lines = text.split("\n");
  const sections = findSections(lines, label);
  assertUniqueNames(sections, label);
  return new Map(
    sections.map((section) => [
      section.name,
      lines.slice(section.begin + 1, section.end),
    ]),
  );
}

function assertNoUnknownSections(
  kept: Map<string, string[]>,
  templateSections: Section[],
  label: string,
): void {
  const known = new Set(templateSections.map((section) => section.name));
  for (const [name, lines] of kept) {
    const isEmpty = lines.every((line) => line.trim() === "");
    if (!known.has(name) && !isEmpty) {
      throw new Error(
        `${label}: section "${name}" is not in the template, so its lines would be dropped.`,
      );
    }
  }
}

/**
 * Renders a template for a repository. A section between
 * `# np-sync:begin <name>` and `# np-sync:end <name>` keeps the repository's
 * own lines when the existing file has a section of that name; everything else
 * comes from the template. Throws when either side has broken markers, so a
 * repository's own lines are never silently dropped.
 */
export function preserveSections(
  template: string,
  existing: string | null,
  label: string,
): string {
  const templateLines = template.split("\n");
  const sections = findSections(templateLines, `template ${label}`);
  assertUniqueNames(sections, `template ${label}`);
  if (existing === null) {
    return template;
  }
  const kept = readSections(existing, label);
  assertNoUnknownSections(kept, sections, label);
  const output: string[] = [];
  let cursor = 0;
  for (const section of sections) {
    const keptLines = kept.get(section.name);
    output.push(...templateLines.slice(cursor, section.begin + 1));
    output.push(
      ...(keptLines ?? templateLines.slice(section.begin + 1, section.end)),
    );
    cursor = section.end;
  }
  output.push(...templateLines.slice(cursor));
  return output.join("\n");
}
