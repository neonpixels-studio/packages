import { beforeAll, describe, expect, it } from "vitest";
import {
  ranFiles,
  runFixture,
  type FixtureFile,
  type FixtureResult,
} from "./helpers/runFixture.ts";

const EXPECTED_FILES: Record<string, string[]> = {
  node: ["environment.fixture.ts"],
  vitepress: ["browser.fixture.ts", "Greeting.fixture.ts"],
  nuxt: ["browser.fixture.ts", "Greeting.fixture.ts"],
  "nuxt-stubs": ["nuxt.fixture.ts"],
};

function describeFailures(file: FixtureFile): string[] {
  const failedTests = file.assertionResults
    .filter((assertion) => assertion.status !== "passed")
    .map(
      (assertion) =>
        `${assertion.fullName}: ${assertion.failureMessages.join("\n")}`,
    );
  const loadFailure =
    file.status === "passed" ? [] : [`${file.name}: ${file.message}`];
  return [...failedTests, ...loadFailure];
}

describe.each(Object.keys(EXPECTED_FILES))("%s preset", (name) => {
  let result: FixtureResult;

  beforeAll(async () => {
    result = await runFixture(name);
  }, 60_000);

  it("passes every test in its fixture project", () => {
    const failures = result.testResults.flatMap(describeFailures);
    expect(failures).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("runs the consumer's include globs and skips e2e directories", () => {
    expect(ranFiles(result)).toEqual([...EXPECTED_FILES[name]!].sort());
  });
});
