import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RUN_BLOCK_INDENT = 10;

function readWorkflow(name: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
    ),
    "utf-8",
  ).replaceAll("\r\n", "\n");
}

const WORKFLOWS = {
  gitleaks: readWorkflow("gitleaks"),
  "dependency-audit": readWorkflow("dependency-audit"),
};

describe.each(Object.entries(WORKFLOWS))(
  "reusable %s workflow",
  (_name, text) => {
    it("is callable", () => {
      expect(text).toMatch(/^on:\n {2}workflow_call:/m);
    });

    it("declares read-only contents permissions at workflow and job level", () => {
      expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
      expect(text).toMatch(/^ {4}permissions:\n {6}contents: read$/m);
    });

    it("declares no secrets", () => {
      expect(text).not.toMatch(/^ {4}secrets:/m);
      expect(text).not.toContain("${{ secrets.");
      expect(text).not.toMatch(/^\s+[a-z-]+: write$/m);
    });

    it("never interpolates inputs or event data into a shell script", () => {
      const scriptLines = text
        .split("\n")
        .filter(
          (line) =>
            line.includes("${{") &&
            !/^\s+[A-Z_]+: \$\{\{/.test(line) &&
            !/^\s+(node-version-file|if):/.test(line),
        );
      expect(scriptLines).toEqual([]);
    });
  },
);

describe("reusable dependency-audit workflow inputs", () => {
  const text = WORKFLOWS["dependency-audit"];

  it("is limited to stack inputs plus the pinned scripts version", () => {
    const inputsBlock = text.slice(
      text.indexOf("    inputs:\n"),
      text.indexOf("\npermissions:"),
    );
    const names = [...inputsBlock.matchAll(/^ {6}([a-z-]+):$/gm)].map(
      (match) => match[1],
    );
    expect(names).toEqual([
      "package-manager",
      "node-version-file",
      "scripts-version",
      "include-dev",
    ]);
  });

  it("takes include-dev as an optional boolean that defaults to false", () => {
    expect(text).toMatch(
      /^ {6}include-dev:\n(?: {8}.*\n)*? {8}type: boolean\n {8}default: false$/m,
    );
  });

  it("passes the flag through and keeps the job name unchanged", () => {
    expect(text).not.toMatch(/^ {4}name:/m);
    expect(text).toContain("INCLUDE_DEV: ${{ inputs.include-dev }}");
    expect(text).toContain("gate_flags+=(--include-dev)");
    expect(text.match(/np-audit-gate "\$\{gate_flags\[@\]\}"/g)).toHaveLength(
      2,
    );
  });

  it("runs np-audit-gate from the published package at the pinned version", () => {
    expect(text).toContain(
      'pnpm --package="@neon-pixels/scripts@${SCRIPTS_VERSION}" dlx np-audit-gate',
    );
    expect(text).toContain(
      'npm exec --yes --ignore-scripts --package "@neon-pixels/scripts@${SCRIPTS_VERSION}" -- np-audit-gate',
    );
  });

  function runStep(
    stepName: string,
    environment: Record<string, string>,
    workingDirectory: string = process.cwd(),
  ): number {
    const start = text.indexOf(`      - name: ${stepName}\n`);
    if (start === -1) {
      throw new Error(`Step not found: ${stepName}`);
    }
    const block = text.slice(start + 1);
    const step = block.split(/\n {6}\S/)[0] ?? block;
    const script = step
      .slice(step.indexOf("run: |\n") + "run: |\n".length)
      .split("\n")
      .map((line) => line.slice(RUN_BLOCK_INDENT))
      .join("\n");
    return (
      spawnSync("bash", ["-c", script], {
        cwd: workingDirectory,
        env: { PATH: process.env.PATH, ...environment },
      }).status ?? -1
    );
  }

  describe("lockfile check step", () => {
    const STEP = "Check the lockfile matches package-manager";

    function runWithLockfile(
      packageManager: string,
      lockfile: string | null,
    ): number {
      const directory = mkdtempSync(join(tmpdir(), "np-lockfile-"));
      try {
        if (lockfile) {
          writeFileSync(join(directory, lockfile), "");
        }
        return runStep(STEP, { PACKAGE_MANAGER: packageManager }, directory);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }

    it.each([
      ["pnpm", "pnpm-lock.yaml"],
      ["npm", "package-lock.json"],
      ["npm", "npm-shrinkwrap.json"],
    ])("accepts %s with %s", (packageManager, lockfile) => {
      expect(runWithLockfile(packageManager, lockfile)).toBe(0);
    });

    it.each([
      ["pnpm", null],
      ["pnpm", "package-lock.json"],
      ["npm", null],
      ["npm", "pnpm-lock.yaml"],
    ])("rejects %s with %s", (packageManager, lockfile) => {
      expect(runWithLockfile(packageManager, lockfile)).toBe(1);
    });
  });

  describe("input validation step", () => {
    function validate(packageManager: string, scriptsVersion: string): number {
      return runStep("Validate inputs", {
        PACKAGE_MANAGER: packageManager,
        SCRIPTS_VERSION: scriptsVersion,
      });
    }

    it.each([
      ["npm", "0.2.0"],
      ["pnpm", "1.10.3-beta.1"],
    ])("accepts %s at %s", (packageManager, version) => {
      expect(validate(packageManager, version)).toBe(0);
    });

    it.each([
      ["yarn", "0.2.0"],
      ["pnpm", "latest"],
      ["pnpm", "^0.2.0"],
      ["pnpm", "0.2.0 && echo pwned"],
    ])("rejects %s at %s", (packageManager, version) => {
      expect(validate(packageManager, version)).toBe(1);
    });
  });
});

describe("reusable gitleaks workflow", () => {
  const text = WORKFLOWS.gitleaks;

  it("fails clearly when the gitleaks config is missing", () => {
    expect(text).toContain(".gitleaks.toml is required");
  });

  it("takes no inputs", () => {
    expect(text).not.toContain("inputs:");
  });

  it("verifies the downloaded gitleaks against a pinned digest", () => {
    expect(text).toMatch(/GITLEAKS_SHA256: [0-9a-f]{64}/);
    expect(text).toContain("sha256sum --check");
  });

  it("scans the pull request range, or the full history otherwise", () => {
    expect(text).toContain("github.event_name == 'pull_request'");
    expect(text).toContain("github.event_name != 'pull_request'");
    expect(text).toContain("--redact");
  });
});
