import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RUN_BLOCK_INDENT = 10;

export function readText(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf-8",
  ).replaceAll("\r\n", "\n");
}

export function inputNames(text: string): string[] {
  const start = text.indexOf("    inputs:\n");
  const block = text
    .slice(start)
    .split(/\n(?: {4}(?:secrets|outputs):|permissions:)/)[0];
  return [...(block ?? "").matchAll(/^ {6}([a-z-]+):$/gm)].map(
    (match) => match[1] ?? "",
  );
}

export function jobBlock(text: string, job: string): string {
  const start = text.indexOf(`\n  ${job}:\n`);
  if (start === -1) {
    throw new Error(`Job not found: ${job}`);
  }
  const rest = text.slice(start + 1);
  return rest.split(/\n {2}\S/)[0] ?? rest;
}

export function stepScript(text: string, stepName: string): string {
  const start = text.indexOf(`      - name: ${stepName}\n`);
  if (start === -1) {
    throw new Error(`Step not found: ${stepName}`);
  }
  const block = text.slice(start + 1);
  const step = block.split(/\n(?: {0,5}\S| {6}[-#])/)[0] ?? block;
  const marker = step.indexOf("run: |\n");
  if (marker === -1) {
    throw new Error(`Step has no run: | block: ${stepName}`);
  }
  return step
    .slice(marker + "run: |\n".length)
    .split("\n")
    .map((line) => line.slice(RUN_BLOCK_INDENT))
    .join("\n");
}

export interface ScriptRun {
  status: number;
  stdout: string;
  calls: Record<string, string[]>;
}

function writeFakeCommands(
  directory: string,
  fakes: Record<string, string>,
): void {
  for (const [name, body] of Object.entries(fakes)) {
    const fake = join(directory, name);
    writeFileSync(
      fake,
      `#!/bin/bash\necho "$*" >> "${join(directory, `${name}.log`)}"\n${body}\n`,
    );
    chmodSync(fake, 0o755);
  }
}

function readFakeCalls(
  directory: string,
  names: string[],
): Record<string, string[]> {
  const calls: Record<string, string[]> = {};
  for (const name of names) {
    const log = join(directory, `${name}.log`);
    calls[name] = existsSync(log)
      ? readFileSync(log, "utf-8").split("\n").filter(Boolean)
      : [];
  }
  return calls;
}

// Runs a step's script with fake commands first on PATH. Each fake records its
// arguments and runs the given shell body (which may print or exit non-zero).
export function runScript(
  script: string,
  environment: Record<string, string>,
  fakes: Record<string, string> = {},
): ScriptRun {
  const directory = mkdtempSync(join(tmpdir(), "np-fake-bin-"));
  try {
    writeFakeCommands(directory, fakes);
    const result = spawnSync("bash", ["-c", script], {
      env: {
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_SERVER_URL: "https://github.example",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "42",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_SHA: "abc123",
        DEPLOY_FAILURE_LABEL: "deploy-failure",
        DEPLOY_FAILURE_TITLE: "Production deploy failed",
        ...environment,
      },
    });
    return {
      status: result.status ?? -1,
      stdout: result.stdout.toString(),
      calls: readFakeCalls(directory, Object.keys(fakes)),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function runGh(
  script: string,
  environment: Record<string, string>,
  listOutput: string,
  listStatus = 0,
): { status: number; gh: string[] } {
  const result = runScript(script, environment, {
    gh: `if [ "$1 $2" = "issue list" ]; then echo "${listOutput}"; exit ${listStatus}; fi`,
  });
  return { status: result.status, gh: result.calls.gh ?? [] };
}

export function statusOf(script: string, environment: Record<string, string>) {
  return runScript(script, environment).status;
}

export function secretNames(text: string): string[] {
  const block = text.slice(
    text.indexOf("    secrets:\n"),
    text.indexOf("\npermissions:"),
  );
  return [...block.matchAll(/^ {6}([A-Z_]+):$/gm)].map(
    (match) => match[1] ?? "",
  );
}

export function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}
