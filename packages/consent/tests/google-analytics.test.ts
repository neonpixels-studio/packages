import { describe, expect, it } from "vitest";
import { loadGoogleAnalytics } from "../src/index.ts";

function createFakeBrowser() {
  const appended: { async: boolean; src: string }[] = [];
  return {
    appended,
    document: {
      createElement: () => ({ async: false, src: "" }),
      head: {
        appendChild: (node: unknown) => {
          appended.push(node as { async: boolean; src: string });
        },
      },
    },
    window: {} as Record<string, unknown> & { dataLayer?: unknown[] },
  };
}

describe("loadGoogleAnalytics", () => {
  it("injects the tag once however often it is called", () => {
    const browser = createFakeBrowser();
    loadGoogleAnalytics("G-TEST", browser);
    loadGoogleAnalytics("G-TEST", browser);
    loadGoogleAnalytics("G-TEST", browser);
    expect(browser.appended).toHaveLength(1);
    expect(browser.appended[0]).toEqual({
      async: true,
      src: "https://www.googletagmanager.com/gtag/js?id=G-TEST",
    });
    expect(browser.window.dataLayer).toHaveLength(2);
  });

  it("turns Google signals and ad personalization off and sends no consent commands", () => {
    const browser = createFakeBrowser();
    loadGoogleAnalytics("G-TEST", browser);
    const commands = (browser.window.dataLayer as ArrayLike<unknown>[]).map(
      (command) => Array.from(command),
    );
    expect(commands[0]![0]).toBe("js");
    expect(commands[1]).toEqual([
      "config",
      "G-TEST",
      { allow_google_signals: false, allow_ad_personalization_signals: false },
    ]);
    expect(commands.some((command) => command[0] === "consent")).toBe(false);
  });

  it("keeps an existing dataLayer", () => {
    const browser = createFakeBrowser();
    browser.window.dataLayer = ["existing"];
    loadGoogleAnalytics("G-TEST", browser);
    expect(browser.window.dataLayer[0]).toBe("existing");
    expect(browser.window.dataLayer).toHaveLength(3);
  });

  it("configures a second measurement id without a second tag", () => {
    const browser = createFakeBrowser();
    loadGoogleAnalytics("G-A", browser);
    loadGoogleAnalytics("G-B", browser);
    loadGoogleAnalytics("G-B", browser);
    expect(browser.appended).toHaveLength(1);
    const configs = (browser.window.dataLayer as ArrayLike<unknown>[])
      .map((command) => Array.from(command))
      .filter((command) => command[0] === "config")
      .map((command) => command[1]);
    expect(configs).toEqual(["G-A", "G-B"]);
  });

  it("injects separately for separate windows", () => {
    const first = createFakeBrowser();
    const second = createFakeBrowser();
    loadGoogleAnalytics("G-TEST", first);
    loadGoogleAnalytics("G-TEST", second);
    expect(first.appended).toHaveLength(1);
    expect(second.appended).toHaveLength(1);
  });

  it("re-enables a tag that deny() switched off, without a second tag", () => {
    const browser = createFakeBrowser();
    loadGoogleAnalytics("G-TEST", browser);
    browser.window["ga-disable-G-TEST"] = true;
    loadGoogleAnalytics("G-TEST", browser);
    expect(browser.window["ga-disable-G-TEST"]).toBe(false);
    expect(browser.appended).toHaveLength(1);
  });
});
