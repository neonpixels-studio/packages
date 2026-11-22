import { describe, expect, it } from "vitest";
import { ranFiles, runFixture } from "./helpers/runFixture.ts";

const EXPECTED_FILES: Record<string, string[]> = {
  node: ["environment.fixture.ts"],
  vitepress: ["browser.fixture.ts", "Greeting.fixture.ts"],
  nuxt: ["browser.fixture.ts", "nuxt.fixture.ts", "Greeting.fixture.ts"],
};

describe.each(Object.keys(EXPECTED_FILES))("%s preset", (name) => {
  it("passes every test in its fixture project", async () => {
    const result = await runFixture(name);
    const failures = result.testResults.flatMap((file) =>
      file.assertionResults
        .filter((assertion) => assertion.status !== "passed")
        .map((assertion) => `${assertion.fullName}: ${file.message}`),
    );
    expect(failures).toEqual([]);
    expect(result.success).toBe(true);
  }, 60_000);

  it("runs the consumer's include globs and skips e2e directories", async () => {
    const result = await runFixture(name);
    expect(ranFiles(result)).toEqual([...EXPECTED_FILES[name]!].sort());
  }, 60_000);
});
