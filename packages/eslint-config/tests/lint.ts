import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";

const FIXTURES_DIRECTORY = fileURLToPath(
  new URL("./fixtures/", import.meta.url),
);

/**
 * Lints a fixture as if it lived at `virtualPath` in a consuming repo and
 * returns the sorted, de-duplicated rule ids that fired.
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
  const ruleIds = result.messages.map((message) => message.ruleId ?? "(none)");
  return [...new Set(ruleIds)].sort();
}
