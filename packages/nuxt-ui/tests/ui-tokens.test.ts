import { describe, expect, it, vi } from "vitest";
import {
  findMissingTokens,
  UI_TOKENS,
  warnAboutMissingTokens,
} from "../shared/lib/index.ts";

describe("UI_TOKENS", () => {
  it("lists the ten variables of the contract", () => {
    expect([...UI_TOKENS]).toEqual([
      "--ui-bg",
      "--ui-surface",
      "--ui-ink",
      "--ui-muted",
      "--ui-border",
      "--ui-accent",
      "--ui-on-accent",
      "--ui-danger",
      "--ui-radius",
      "--ui-backdrop",
    ]);
  });
});

describe("findMissingTokens", () => {
  it("reports tokens that resolve to nothing or only whitespace", () => {
    const resolved = new Set(["--ui-bg", "--ui-ink"]);
    const missing = findMissingTokens((name) =>
      resolved.has(name) ? " #fff " : "  ",
    );
    expect(missing).toEqual(UI_TOKENS.filter((name) => !resolved.has(name)));
  });

  it("reports nothing when every token resolves", () => {
    expect(findMissingTokens(() => "1px")).toEqual([]);
  });
});

describe("warnAboutMissingTokens", () => {
  it("logs one warning that lists every missing name", () => {
    const warn = vi.fn();
    warnAboutMissingTokens(
      (name) => (name === "--ui-bg" || name === "--ui-danger" ? "" : "1"),
      warn,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("--ui-bg, --ui-danger");
    expect(warn.mock.calls[0]?.[0]).not.toContain("--ui-ink");
  });

  it("stays silent when every token resolves", () => {
    const warn = vi.fn();
    warnAboutMissingTokens(() => "1", warn);
    expect(warn).not.toHaveBeenCalled();
  });
});
