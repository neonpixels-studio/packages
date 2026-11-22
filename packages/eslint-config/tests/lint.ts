import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";

const ERROR_SEVERITY = 2;
const FIXTURES_DIRECTORY = fileURLToPath(
  new URL("./fixtures/", import.meta.url),
);

function describeMessage(message: Linter.LintMessage): string {
  const severity = message.severity === ERROR_SEVERITY ? "error" : "warn";
  return `${severity}:${message.ruleId ?? "(none)"}`;
}

/**
 * Lints a fixture as if it lived at `virtualPath` in a consuming repo and
 * returns one sorted `severity:ruleId` entry per report.
 */
export async function lintFixture(
  config: Linter.Config[],
  fixture: string,
  virtualPath: string,
): Promise<string[]> {
  const source = await readFile(
    `${FIXTURES_DIRECTORY}${fixture}.fixture`,
    "utf8",
  );
  const eslint = new ESLint({
    cwd: FIXTURES_DIRECTORY,
    overrideConfigFile: true,
    overrideConfig: config,
  });
  const [result] = await eslint.lintText(source, { filePath: virtualPath });
  if (!result) {
    throw new Error(`${fixture} produced no lint result`);
  }
  const fatal = result.messages.find((message) => message.fatal);
  if (fatal) {
    throw new Error(`${fixture} failed to parse: ${fatal.message}`);
  }
  return result.messages.map(describeMessage).sort();
}
