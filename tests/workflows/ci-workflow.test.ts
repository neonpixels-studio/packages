import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CI_WORKFLOW = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)),
  "utf-8",
).replaceAll("\r\n", "\n");

describe("ci workflow", () => {
  it.each(["ci", "gitleaks", "dependency-audit"])(
    "defines the %s job",
    (job) => {
      expect(CI_WORKFLOW).toMatch(new RegExp(`^  ${job}:$`, "m"));
    },
  );

  it("declares read-only contents permissions", () => {
    expect(CI_WORKFLOW).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it("cancels superseded runs", () => {
    expect(CI_WORKFLOW).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
  });

  it("gives every push its own concurrency group so none is cancelled", () => {
    expect(CI_WORKFLOW).toContain(
      "github.event.pull_request.number || github.sha",
    );
  });

  it.each(["gitleaks", "dependency-audit"])(
    "calls the reusable %s workflow",
    (name) => {
      expect(CI_WORKFLOW).toContain(`uses: ./.github/workflows/${name}.yml`);
    },
  );

  it("pins the audit gate version for the reusable audit", () => {
    expect(CI_WORKFLOW).toMatch(/^ {6}scripts-version: \d+\.\d+\.\d+$/m);
  });

  it("checks action pinning with the shared check", () => {
    expect(CI_WORKFLOW).toContain("pnpm exec np-check-action-pinning");
  });
});
