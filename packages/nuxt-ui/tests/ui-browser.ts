import type { Browser, Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activeElementId,
  documentOverflow,
  isInsideDialog,
  launchBrowser,
  openWatchedPage,
  type WatchedPage,
} from "./browser-helpers.ts";

const TAB_PRESSES = 12;
const BROWSER_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 30_000;
const BACKDROP_POINT = { x: 4, y: 4 };

const PRIVACY_SIGNALS = [
  [
    "Global Privacy Control",
    'Object.defineProperty(navigator, "globalPrivacyControl", { value: true });',
  ],
  [
    "Do Not Track",
    'Object.defineProperty(navigator, "doNotTrack", { value: "1" });',
  ],
] as const;

async function press(page: Page, key: string, times = 1): Promise<void> {
  for (let count = 0; count < times; count += 1) {
    await page.keyboard.press(key);
  }
}

async function isDialogOpen(page: Page, title: string): Promise<boolean> {
  return page
    .locator("dialog", { has: page.locator("h2", { hasText: title }) })
    .evaluate((dialog: HTMLDialogElement) => dialog.open);
}

// Runs against the fixture page of every component, in a real browser, because
// the test DOM has no focus trap, inert page, Escape, or backdrop.
export function describeComponentsInBrowser(getOrigin: () => string): void {
  let browser: Browser;
  let watched: WatchedPage;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
  }, BROWSER_TIMEOUT_MS);

  afterEach(async () => {
    await watched?.close();
  });

  afterAll(async () => {
    await browser?.close();
  });

  async function open(initScript = ""): Promise<void> {
    watched = await openWatchedPage(
      browser,
      `${getOrigin()}/components`,
      initScript,
    );
    page = watched.page;
  }

  describe("the components page", { timeout: TEST_TIMEOUT_MS }, () => {
    it("loads under the enforced Content-Security-Policy with no violation", async () => {
      const response = await fetch(`${getOrigin()}/components`);
      expect(response.headers.get("content-security-policy")).toMatch(
        /script-src/,
      );
      expect(response.headers.has("content-security-policy-report-only")).toBe(
        false,
      );

      await open();
      await page.locator("#open-first").click();
      await page.locator("#open-second").click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.locator("#toggle-loading").click();
      await page.getByLabel("Notes").fill("typed");
      await page.getByRole("button", { name: "Decline" }).click();

      expect(await watched.violations()).toEqual([]);
      expect(
        watched.problems.filter((problem) => /security policy/i.test(problem)),
      ).toEqual([]);
    });

    it.each(PRIVACY_SIGNALS)(
      "hydrates without a mismatch for a visitor sending %s, with no banner and no link",
      async (_name, script) => {
        await open(script);
        expect(await page.getByText("Your privacy choices").count()).toBe(0);
        expect(await page.getByText("Cookie settings").count()).toBe(0);
        expect(
          watched.problems.filter((problem) => /hydrat/i.test(problem)),
        ).toEqual([]);
      },
    );

    it("shows the banner without taking focus, and focuses it when reopened", async () => {
      await open();
      const banner = page.getByRole("region", { name: "Your privacy choices" });
      await banner.waitFor();
      expect(await activeElementId(page)).toBe("");
      expect(
        await banner.evaluate((node) => node === document.activeElement),
      ).toBe(false);
      expect(
        watched.problems.filter((problem) => /hydrat/i.test(problem)),
      ).toEqual([]);

      await page.getByRole("button", { name: "Decline" }).click();
      await banner.waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Cookie settings" }).click();
      await banner.waitFor();
      expect(
        await banner.evaluate((node) => node === document.activeElement),
      ).toBe(true);
    });

    it("keeps a loading button the same width and silent", async () => {
      await open();
      const target = page.locator("#button-loading");
      const before = (await target.boundingBox())?.width ?? 0;
      await page.locator("#toggle-loading").click();
      await expect.poll(() => target.getAttribute("aria-busy")).toBe("true");
      const after = (await target.boundingBox())?.width ?? 0;
      expect(after).toBe(before);
      expect(await target.isDisabled()).toBe(true);
      const pressed = await page.evaluate(() => {
        const button = document.querySelector("#button-loading") as HTMLElement;
        let clicks = 0;
        button.addEventListener("click", () => (clicks += 1));
        button.click();
        return clicks;
      });
      expect(pressed).toBe(0);
    });

    it("draws a visible focus ring from the accent token on a keyboard focus", async () => {
      await open();
      await page.locator("#button-default").focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const outline = await page
        .locator("#button-default")
        .evaluate((node) => getComputedStyle(node).outlineStyle);
      expect(outline).toBe("solid");
    });

    it("does not make a disabled link focusable or navigable", async () => {
      await open();
      const link = page.locator("#link-disabled");
      expect(await link.getAttribute("href")).toBeNull();
      await link.click({ force: true });
      expect(new URL(page.url()).pathname).toBe("/components");
      const visited = new Set<string>();
      for (let count = 0; count < 40; count += 1) {
        await page.keyboard.press("Tab");
        visited.add(await activeElementId(page));
      }
      expect(visited.has("link-active")).toBe(true);
      expect(visited.has("link-disabled")).toBe(false);
    });
  });

  describe("UiModal in a real browser", { timeout: TEST_TIMEOUT_MS }, () => {
    it("moves focus in, traps Tab, locks scrolling, and gives focus back on Escape", async () => {
      await open();
      await page.locator("#open-first").click();

      expect(await isDialogOpen(page, "First modal")).toBe(true);
      expect(await isInsideDialog(page)).toBe(true);
      expect(await documentOverflow(page)).toBe("hidden");

      await press(page, "Tab", TAB_PRESSES);
      expect(await isInsideDialog(page)).toBe(true);
      await press(page, "Shift+Tab", TAB_PRESSES);
      expect(await isInsideDialog(page)).toBe(true);

      await page.mouse.wheel(0, 800);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      await page.keyboard.press("Escape");
      expect(await isDialogOpen(page, "First modal")).toBe(false);
      expect(await activeElementId(page)).toBe("open-first");
      expect(await documentOverflow(page)).toBe("visible");
      expect(await page.locator("#close-reasons").textContent()).toBe("escape");
    });

    it("closes on a click on the backdrop, but not on a drag from inside it", async () => {
      await open();
      await page.locator("#open-first").click();
      const panel = (await page
        .locator("dialog[open] .ui-modal__panel")
        .boundingBox())!;

      await page.mouse.move(panel.x + 10, panel.y + 10);
      await page.mouse.down();
      await page.mouse.move(BACKDROP_POINT.x, BACKDROP_POINT.y);
      await page.mouse.up();
      expect(await isDialogOpen(page, "First modal")).toBe(true);

      await page.mouse.click(BACKDROP_POINT.x, BACKDROP_POINT.y);
      expect(await isDialogOpen(page, "First modal")).toBe(false);
      expect(await page.locator("#close-reasons").textContent()).toBe(
        "backdrop",
      );
    });

    it("ignores Escape and the backdrop when not dismissible, and closes through the app", async () => {
      await open();
      await page.locator("#open-locked").click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.mouse.click(BACKDROP_POINT.x, BACKDROP_POINT.y);
      expect(await isDialogOpen(page, "Locked modal")).toBe(true);
      expect(await page.locator("#close-reasons").textContent()).toBe("");

      await page.locator("#close-locked").click();
      expect(await isDialogOpen(page, "Locked modal")).toBe(false);
      expect(await page.locator("#close-reasons").textContent()).toBe(
        "programmatic",
      );
      expect(await activeElementId(page)).toBe("open-locked");
    });

    it("focuses the first autofocus element on open", async () => {
      await open();
      await page.locator("#open-first").click();
      await page.locator("#open-second").click();
      expect(await activeElementId(page)).toBe("second-autofocus");
    });

    it("restores focus and scrolling when two modals close top first", async () => {
      await open();
      await page.locator("#open-first").click();
      await page.locator("#open-second").click();
      await page.keyboard.press("Escape");
      expect(await activeElementId(page)).toBe("open-second");
      expect(await documentOverflow(page)).toBe("hidden");
      await page.keyboard.press("Escape");
      expect(await activeElementId(page)).toBe("open-first");
      expect(await documentOverflow(page)).toBe("visible");
    });

    it("restores focus and scrolling when two modals close bottom first", async () => {
      await open();
      await page.locator("#open-first").click();
      await page.locator("#open-second").click();
      await page.locator("#close-first-from-second").click();
      expect(await isDialogOpen(page, "First modal")).toBe(false);
      expect(await documentOverflow(page)).toBe("hidden");
      await page.keyboard.press("Escape");
      expect(await activeElementId(page)).toBe("open-first");
      expect(await documentOverflow(page)).toBe("visible");
    });

    it("restores focus and scrolling when removed from the page while open", async () => {
      await open();
      await page.locator("#open-removable").click();
      expect(await documentOverflow(page)).toBe("hidden");
      await page.locator("#remove-modal").click();
      expect(
        await page.locator("dialog", { hasText: "Removable" }).count(),
      ).toBe(0);
      expect(await documentOverflow(page)).toBe("visible");
      expect(await activeElementId(page)).toBe("open-removable");
    });
  });
}
