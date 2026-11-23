function fillRow(
  table: number[][],
  before: string[],
  after: string[],
  row: number,
): void {
  for (let column = after.length - 1; column >= 0; column--) {
    table[row]![column] =
      before[row] === after[column]
        ? table[row + 1]![column + 1]! + 1
        : Math.max(table[row + 1]![column]!, table[row]![column + 1]!);
  }
}

function longestCommonSubsequence(
  before: string[],
  after: string[],
): number[][] {
  const table = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let row = before.length - 1; row >= 0; row--) {
    fillRow(table, before, after, row);
  }
  return table;
}

/** A line diff with `-` for lines only in the repository and `+` for lines only in the template. Unchanged lines are left out. */
export function describeDifference(before: string, after: string): string[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const table = longestCommonSubsequence(beforeLines, afterLines);
  const changes: string[] = [];
  let row = 0;
  let column = 0;
  while (row < beforeLines.length || column < afterLines.length) {
    if (
      row < beforeLines.length &&
      column < afterLines.length &&
      beforeLines[row] === afterLines[column]
    ) {
      row++;
      column++;
    } else if (
      column >= afterLines.length ||
      (row < beforeLines.length &&
        table[row + 1]![column]! >= table[row]![column + 1]!)
    ) {
      changes.push(`- ${beforeLines[row]}`);
      row++;
    } else {
      changes.push(`+ ${afterLines[column]}`);
      column++;
    }
  }
  return changes;
}
