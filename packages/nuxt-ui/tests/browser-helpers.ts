import { chromium, type Browser, type Page } from "@playwright/test";

// The bundled Chromium when it is installed, else the Chrome of the machine
// (CI runners ship one), so the tests need no browser download step.
export async function launchBrowser(): Promise<Browser> {
  const failures: string[] = [];
  for (const options of [{}, { channel: "chrome" }]) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      failures.push(String(error).split("\n")[0] ?? "");
    }
  }
  throw new Error(`no browser could be launched: ${failures.join(" | ")}`);
}

export interface WatchedPage {
  page: Page;
  // Content-Security-Policy violations the page reported.
  violations: () => Promise<string[]>;
  // Console warnings and errors.
  problems: string[];
}

const VIOLATION_RECORDER = `
  window.__violations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__violations.push(event.violatedDirective + " " + event.blockedURI);
  });
`;

export async function openWatchedPage(
  browser: Browser,
  url: string,
  initScript = "",
): Promise<WatchedPage> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.addInitScript(VIOLATION_RECORDER + initScript);
  await page.goto(url);
  await page.locator("#hydrated", { hasText: "true" }).waitFor();
  return {
    page,
    problems,
    violations: () =>
      page.evaluate(
        () => (window as unknown as { __violations: string[] }).__violations,
      ),
  };
}

export function activeElementId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id ?? "");
}

export function isInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.activeElement?.closest("dialog[open]") !== null,
  );
}

export function documentOverflow(page: Page): Promise<string> {
  return page.evaluate(
    () => getComputedStyle(document.documentElement).overflow,
  );
}
