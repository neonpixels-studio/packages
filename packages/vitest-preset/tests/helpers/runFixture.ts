import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const vitestBin = path.join(
  path.dirname(require.resolve("vitest/package.json")),
  "vitest.mjs",
);
const FIXTURES_DIR = fileURLToPath(new URL("../fixtures/", import.meta.url));

// A zone with a non-zero offset in every season, so a missing TZ=UTC shows up.
const HOST_TIMEZONE = "America/New_York";

export interface FixtureFile {
  name: string;
  status: string;
  message: string;
  assertionResults: {
    fullName: string;
    status: string;
    failureMessages: string[];
  }[];
}

export interface FixtureResult {
  success: boolean;
  testResults: FixtureFile[];
}

/** Host environment minus the outer run's VITEST_* variables, with a non-UTC timezone. */
function cleanEnvironment(): NodeJS.ProcessEnv {
  const inherited = Object.entries(process.env).filter(
    ([key]) => !key.startsWith("VITEST"),
  );
  return { ...Object.fromEntries(inherited), TZ: HOST_TIMEZONE };
}

async function runVitest(root: string, reportFile: string): Promise<unknown> {
  const args = [
    vitestBin,
    "run",
    "--root",
    root,
    "--reporter=json",
    `--outputFile=${reportFile}`,
  ];
  // A failing fixture exits non-zero but still writes its report.
  return execFileAsync(process.execPath, args, {
    env: cleanEnvironment(),
  }).then(
    () => null,
    (error: unknown) => error,
  );
}

/** Runs a fixture project's own Vitest in a child process and returns its JSON report. */
export async function runFixture(name: string): Promise<FixtureResult> {
  const reportDirectory = await mkdtemp(path.join(tmpdir(), "vitest-preset-"));
  const reportFile = path.join(reportDirectory, "report.json");
  try {
    const runError = await runVitest(path.join(FIXTURES_DIR, name), reportFile);
    const report = await readFile(reportFile, "utf8").catch(() => null);
    if (report === null) {
      throw new Error(`Fixture "${name}" produced no report`, {
        cause: runError,
      });
    }
    return JSON.parse(report) as FixtureResult;
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

export function ranFiles(result: FixtureResult): string[] {
  return result.testResults.map((file) => path.basename(file.name)).sort();
}
