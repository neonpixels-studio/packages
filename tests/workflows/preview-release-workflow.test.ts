import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PREVIEW_WORKFLOW = readFileSync(
  fileURLToPath(
    new URL("../../.github/workflows/preview-release.yml", import.meta.url),
  ),
  "utf-8",
).replaceAll("\r\n", "\n");

// Comments are documentation, not behavior, so assertions ignore them.
const PREVIEW_WORKFLOW_CODE = PREVIEW_WORKFLOW.split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

describe("preview release workflow", () => {
  it("never uses pull_request_target", () => {
    expect(PREVIEW_WORKFLOW_CODE).not.toContain("pull_request_target");
  });

  it("references no secrets", () => {
    expect(PREVIEW_WORKFLOW_CODE).not.toMatch(/secrets\./);
  });

  it("grants no permissions at the top level", () => {
    expect(PREVIEW_WORKFLOW_CODE).toMatch(/^permissions: \{\}$/m);
  });

  it("triggers on submitted reviews and pushes to main only", () => {
    expect(PREVIEW_WORKFLOW_CODE).toMatch(
      /^on:\n {2}pull_request_review:\n {4}types: \[submitted\]\n {2}push:\n {4}branches: \[main\]\n/m,
    );
  });

  it("runs the check job only for approving reviews", () => {
    expect(PREVIEW_WORKFLOW_CODE).toMatch(
      /^ {4}if: github\.event_name == 'push' \|\| github\.event\.review\.state == 'approved'$/m,
    );
  });

  it("checks the approver's permission through the API", () => {
    expect(PREVIEW_WORKFLOW_CODE).toContain(
      "collaborators/${REVIEWER}/permission",
    );
    expect(PREVIEW_WORKFLOW_CODE).not.toContain("author_association");
  });

  it("only passes the permission check for write, maintain, or admin", () => {
    expect(PREVIEW_WORKFLOW_CODE).toMatch(/^\s+admin \| maintain \| write\)$/m);
    expect(PREVIEW_WORKFLOW_CODE).toMatch(
      /\*\)\n(?:(?!allowed=true).*\n)*?\s+echo "allowed=false"/,
    );
    // Push branch plus the write-access branch: no other path grants access.
    expect(PREVIEW_WORKFLOW_CODE.match(/allowed=true/g)).toHaveLength(2);
  });

  it("refuses approvals of a commit that is no longer the head", () => {
    const staleGuard = PREVIEW_WORKFLOW_CODE.match(
      /\[ "\$\{REVIEWED_COMMIT\}" != "\$\{HEAD_COMMIT\}" \]; then\n(?:(?!allowed=true|gh api).*\n)*?\s+echo "allowed=false".*\n\s+exit 0\n\s+fi/,
    );
    expect(staleGuard).not.toBeNull();
    expect(staleGuard?.index).toBeLessThan(
      PREVIEW_WORKFLOW_CODE.indexOf("gh api"),
    );
  });

  it("skips app reviewers before calling the permission API", () => {
    const botGuard = PREVIEW_WORKFLOW_CODE.indexOf('*"[bot]")');
    expect(botGuard).toBeGreaterThan(-1);
    expect(botGuard).toBeLessThan(PREVIEW_WORKFLOW_CODE.indexOf("gh api"));
  });

  it("scopes concurrency to the publish job so other reviews cannot cancel it", () => {
    expect(PREVIEW_WORKFLOW_CODE).not.toMatch(/^concurrency:/m);
    expect(PREVIEW_WORKFLOW_CODE).toMatch(
      /^ {2}publish:\n(?:.*\n)*? {4}concurrency:\n/m,
    );
  });

  it("publishes only when the check allowed it", () => {
    expect(PREVIEW_WORKFLOW_CODE).toContain(
      "if: needs.check.outputs.allowed == 'true'",
    );
  });

  it("checks out the reviewed commit without persisting credentials", () => {
    expect(PREVIEW_WORKFLOW_CODE).toContain(
      "ref: ${{ github.event.review.commit_id || github.sha }}",
    );
    expect(PREVIEW_WORKFLOW_CODE).toContain("persist-credentials: false");
  });

  it("installs from the frozen lockfile", () => {
    expect(PREVIEW_WORKFLOW_CODE).toContain("pnpm install --frozen-lockfile");
  });

  it("runs pkg-pr-new from the lockfile, never through npx or dlx", () => {
    expect(PREVIEW_WORKFLOW_CODE).toContain("pnpm exec pkg-pr-new publish");
    expect(PREVIEW_WORKFLOW_CODE).not.toMatch(/npx|pnpm dlx|yarn dlx|bunx/);
  });

  it("publishes once, not once per package", () => {
    expect(PREVIEW_WORKFLOW_CODE.match(/pkg-pr-new publish/g)).toHaveLength(1);
  });

  it("leaves out private packages and exits cleanly when none remain", () => {
    expect(PREVIEW_WORKFLOW_CODE).toContain("select(.private != true)");
    expect(PREVIEW_WORKFLOW_CODE).toContain("nothing to preview");
  });

  it("updates one pull request comment instead of creating many", () => {
    expect(PREVIEW_WORKFLOW_CODE).toContain("--comment=update");
  });
});
