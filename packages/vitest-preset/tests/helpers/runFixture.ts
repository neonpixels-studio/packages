import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
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

export interface FixtureResult {
  success: boolean;
  testResults: {
    name: string;
    status: string;
    message: string;
    assertionResults: { fullName: string; status: string }[];
  }[];
}

function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, TZ: HOST_TIMEZONE };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("VITEST")) {
      delete environment[key];
    }
  }
  return environment;
}

/** Runs a fixture project's own Vitest in a child process and returns its JSON report. */
export async function runFixture(name: string): Promise<FixtureResult> {
  const root = path.join(FIXTURES_DIR, name);
  const reportDirectory = await mkdtemp(path.join(tmpdir(), "vitest-preset-"));
  const reportFile = path.join(reportDirectory, "report.json");
  try {
    // A failing fixture exits non-zero but still writes its report.
    await execFileAsync(
      process.execPath,
      [
        vitestBin,
        "run",
        "--root",
        root,
        "--reporter=json",
        `--outputFile=${reportFile}`,
      ],
      { env: cleanEnvironment() },
    ).catch(() => undefined);
    return JSON.parse(await readFile(reportFile, "utf8")) as FixtureResult;
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

export function ranFiles(result: FixtureResult): string[] {
  return result.testResults.map((file) => path.basename(file.name)).sort();
}
