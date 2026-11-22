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

  it("audits only high severity production advisories", () => {
    expect(CI_WORKFLOW).toContain("pnpm audit --prod --audit-level high");
  });
});
