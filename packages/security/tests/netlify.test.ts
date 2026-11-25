import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeadersFileError, writeHeadersFile } from "../src/netlify.ts";
import { findInlineSources } from "../src/inline.ts";

const sha256 = (content: string) =>
  `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;

const BOOTSTRAP_SCRIPT = 'window.__SITE__={"dark":true};';
const MODULE_SCRIPT = "import './x.js';";
const INLINE_STYLE = "body{margin:0}";

const page = (body: string) =>
  `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "np-security-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

async function writeSite(files: Record<string, string>) {
  for (const [name, content] of Object.entries(files)) {
    const path = join(outDir, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  }
}

async function failure(action: Promise<unknown>): Promise<HeadersFileError> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(HeadersFileError);
    return error as HeadersFileError;
  }
  throw new Error("expected writeHeadersFile to fail");
}

describe("writeHeadersFile", () => {
  it("hashes inline scripts and styles across pages and writes the headers", async () => {
    await writeSite({
      "index.html": page(
        `<script>${BOOTSTRAP_SCRIPT}</script><style>${INLINE_STYLE}</style>`,
      ),
      "docs/guide/index.html": page(
        `<script type="module">${MODULE_SCRIPT}</script><script>${BOOTSTRAP_SCRIPT}</script>`,
      ),
    });

    const result = await writeHeadersFile(outDir, {
      directives: { "img-src": ["'self'", "data:"] },
      reportEndpoint: "/csp-report",
      extraDeniedFeatures: ["payment"],
    });
    const file = await readFile(join(outDir, "_headers"), "utf8");

    expect(result.scriptHashes).toEqual(
      [sha256(BOOTSTRAP_SCRIPT), sha256(MODULE_SCRIPT)].sort(),
    );
    expect(result.styleHashes).toEqual([sha256(INLINE_STYLE)]);
    expect(file.startsWith("/*\n  ")).toBe(true);
    expect(file).toContain(sha256(BOOTSTRAP_SCRIPT));
    expect(file).toContain(sha256(MODULE_SCRIPT));
    expect(file).toContain(sha256(INLINE_STYLE));
    expect(file).not.toContain("'unsafe-inline'");
    expect(file).toContain("  X-Content-Type-Options: nosniff");
    expect(file).toContain("  Strict-Transport-Security: max-age=63072000");
    expect(file).toContain("  X-Frame-Options: DENY");
    expect(file).toContain("payment=()");
    expect(file).toContain("img-src 'self' data:");
    expect(file).toContain('  Reporting-Endpoints: csp-endpoint="/csp-report"');
    expect(file).toContain("report-uri /csp-report; report-to csp-endpoint");
    const policyLine = file
      .split("\n")
      .find((line) => line.includes("Content-Security-Policy"));
    expect(policyLine).toMatch(/script-src 'self' 'sha256-/);
  });

  it("leaves production headers out when production is false", async () => {
    await writeSite({ "index.html": page("<p>hi</p>") });
    await writeHeadersFile(outDir, { production: false });
    const file = await readFile(join(outDir, "_headers"), "utf8");
    expect(file).not.toContain("Strict-Transport-Security");
  });

  it("ignores external scripts, data blocks, comments, and styles inside them", async () => {
    await writeSite({
      "index.html": page(
        `<script src="/a.js"></script><script type="application/ld+json">{"a":1}</script><!-- <p onclick="x()"> --><link rel="stylesheet" href="/a.css">`,
      ),
    });
    const result = await writeHeadersFile(outDir);
    expect(result.scriptHashes).toEqual([]);
    expect(result.styleHashes).toEqual([]);
  });

  it("fails listing the files with inline style attributes or event handlers", async () => {
    await writeSite({
      "index.html": page('<p style="color:red">x</p>'),
      "about/index.html": page('<button onclick="go()">x</button>'),
      "clean.html": page("<p>ok</p>"),
    });
    const error = await failure(writeHeadersFile(outDir));
    expect(error.code).toBe("unhashable-inline");
    expect(error.files.slice().sort()).toEqual([
      "about/index.html",
      "index.html",
    ]);
    expect(error.message).toContain("index.html: <p style>");
    expect(error.message).toContain("about/index.html: <button onclick>");
    expect(error.message).not.toContain("clean.html");
    await expect(readFile(join(outDir, "_headers"))).rejects.toThrow();
  });

  it("does not mistake text that mentions style or onclick for attributes", async () => {
    await writeSite({
      "index.html": page(
        `<p data-style="x" class="onclick">style="a" onclick="b"</p><script>el.setAttribute("style", "a");</script>`,
      ),
    });
    await expect(writeHeadersFile(outDir)).resolves.toBeDefined();
  });

  it("fails when there is no HTML", async () => {
    await writeSite({ "robots.txt": "User-agent: *" });
    const error = await failure(writeHeadersFile(outDir));
    expect(error.code).toBe("no-html");
  });

  it("refuses to overwrite an existing _headers file", async () => {
    await writeSite({
      "index.html": page("<p>x</p>"),
      _headers: "/old\n  X-Old: 1\n",
    });
    const error = await failure(writeHeadersFile(outDir));
    expect(error.code).toBe("headers-file-exists");
    expect(await readFile(join(outDir, "_headers"), "utf8")).toBe(
      "/old\n  X-Old: 1\n",
    );
  });

  it("appends to an existing _headers file when told to", async () => {
    await writeSite({
      "index.html": page("<p>x</p>"),
      _headers: "/old\n  X-Old: 1\n",
    });
    await writeHeadersFile(outDir, { append: true });
    const file = await readFile(join(outDir, "_headers"), "utf8");
    expect(file.startsWith("/old\n  X-Old: 1\n\n/*\n")).toBe(true);
    expect(file).toContain("Content-Security-Policy:");
  });

  it("reports a file once however many attributes it has", async () => {
    await writeSite({
      "index.html": page(
        '<p style="a" onclick="b()">x</p><a href=" JavaScript:void(0)">y</a>',
      ),
    });
    const error = await failure(writeHeadersFile(outDir));
    expect(error.files).toEqual(["index.html"]);
    expect(error.message).toContain("index.html: <a href>");
  });

  it("refuses to append when a header is already set, whatever its case", async () => {
    await writeSite({
      "index.html": page("<p>x</p>"),
      _headers: "/*\n  content-security-policy: default-src 'self'\n",
    });
    const error = await failure(writeHeadersFile(outDir, { append: true }));
    expect(error.code).toBe("header-already-present");
    expect(error.message).toContain("Content-Security-Policy");
  });

  it("fails with no-html for a directory that does not exist", async () => {
    const error = await failure(writeHeadersFile(join(outDir, "missing")));
    expect(error.code).toBe("no-html");
  });

  it("refuses to append a second Content-Security-Policy", async () => {
    await writeSite({ "index.html": page("<p>x</p>") });
    await writeHeadersFile(outDir);
    const error = await failure(writeHeadersFile(outDir, { append: true }));
    expect(error.code).toBe("header-already-present");
  });

  it("puts the hashes in script-src-elem and style-src-elem when supplied", async () => {
    await writeSite({
      "index.html": page(
        `<script>${BOOTSTRAP_SCRIPT}</script><style>${INLINE_STYLE}</style>`,
      ),
    });
    await writeHeadersFile(outDir, {
      directives: {
        "script-src-elem": ["'self'"],
        "style-src-elem": ["'self'"],
      },
    });
    const file = await readFile(join(outDir, "_headers"), "utf8");
    expect(file).toContain(
      `script-src-elem 'self' ${sha256(BOOTSTRAP_SCRIPT)}`,
    );
    expect(file).toContain(`style-src-elem 'self' ${sha256(INLINE_STYLE)}`);
  });

  it("refuses 'unsafe-inline' in any case and in the -attr directives", async () => {
    await writeSite({ "index.html": page("<p>x</p>") });
    for (const directives of [
      { "script-src": ["'UNSAFE-INLINE'"] },
      { "style-src-attr": ["'unsafe-inline'"] },
    ]) {
      const error = await failure(writeHeadersFile(outDir, { directives }));
      expect(error.code).toBe("unsafe-inline-directive");
    }
  });

  it("refuses directives that allow 'unsafe-inline' for scripts or styles", async () => {
    await writeSite({ "index.html": page("<p>x</p>") });
    const error = await failure(
      writeHeadersFile(outDir, {
        directives: { "style-src": ["'unsafe-inline'"] },
      }),
    );
    expect(error.code).toBe("unsafe-inline-directive");
  });
});

describe("writeHeadersFile in report-only mode", () => {
  const SENTRY_ENDPOINT =
    "https://o123.ingest.us.sentry.io/api/456/security/?sentry_key=abc&sentry_environment=preview";
  const policyValue = (file: string, header: string) =>
    file
      .split("\n")
      .find((line) => line.trim().startsWith(`${header}:`))
      ?.split(": ")
      .slice(1)
      .join(": ");

  it("writes only the report-only policy and the reporting endpoint", async () => {
    await writeSite({
      "index.html": page(`<script>${BOOTSTRAP_SCRIPT}</script>`),
    });
    await writeHeadersFile(outDir, {
      reportOnly: true,
      reportEndpoint: "/csp-report",
    });
    const file = await readFile(join(outDir, "_headers"), "utf8");
    expect(file).toContain("  Content-Security-Policy-Report-Only: ");
    expect(file).toContain(sha256(BOOTSTRAP_SCRIPT));
    expect(file).toContain('  Reporting-Endpoints: csp-endpoint="/csp-report"');
    expect(file).not.toMatch(/^\s+Content-Security-Policy:/m);
    expect(file).not.toContain("X-Content-Type-Options");
    expect(file).not.toContain("Strict-Transport-Security");
    expect(file).not.toContain("Permissions-Policy");
  });

  it("writes the same policy string as enforced mode", async () => {
    await writeSite({
      "index.html": page(
        `<script>${BOOTSTRAP_SCRIPT}</script><style>${INLINE_STYLE}</style>`,
      ),
    });
    const options = {
      directives: { "img-src": ["'self'", "data:"] },
      reportEndpoint: "/csp-report",
    };
    await writeHeadersFile(outDir, options);
    const enforced = policyValue(
      await readFile(join(outDir, "_headers"), "utf8"),
      "Content-Security-Policy",
    );
    await rm(join(outDir, "_headers"));
    await writeHeadersFile(outDir, { ...options, reportOnly: true });
    const reportOnly = policyValue(
      await readFile(join(outDir, "_headers"), "utf8"),
      "Content-Security-Policy-Report-Only",
    );
    expect(enforced).toContain(sha256(BOOTSTRAP_SCRIPT));
    expect(reportOnly).toBe(enforced);
  });

  it("requires a report endpoint", async () => {
    await writeSite({ "index.html": page("<p>x</p>") });
    const error = await failure(writeHeadersFile(outDir, { reportOnly: true }));
    expect(error.code).toBe("report-endpoint-required");
    await expect(readFile(join(outDir, "_headers"))).rejects.toThrow();
  });

  it("accepts an https collector on another origin", async () => {
    await writeSite({ "index.html": page("<p>x</p>") });
    await writeHeadersFile(outDir, {
      reportOnly: true,
      reportEndpoint: SENTRY_ENDPOINT,
    });
    const file = await readFile(join(outDir, "_headers"), "utf8");
    expect(file).toContain(`report-uri ${SENTRY_ENDPOINT}; report-to`);
    expect(file).toContain(`csp-endpoint="${SENTRY_ENDPOINT}"`);
  });

  it.each([
    ["spaces", "/csp report"],
    ["a tab", "/csp\treport"],
    ["commas", "/csp,report"],
    ["semicolons", "/csp;script-src *"],
    ["a quote", '/csp"'],
    ["http", "http://r.example/csp"],
    ["a single-slash https URL", "https:/r.example/csp"],
    ["an https URL with no slashes", "https:r.example/csp"],
    ["a scheme-relative URL", "//r.example/csp"],
    ["a relative path", "csp-report"],
    ["another scheme", "javascript:alert(1)"],
    ["a backslash", "/\\evil.example/csp"],
    ["a newline", "/csp\nX-Injected: 1"],
    ["non-ASCII characters", "/csp-r\u00e9port"],
    ["credentials", "https://user:pass@r.example/csp"],
    ["spaces in a URL", "https://r.example/a b"],
    ["a semicolon in a URL", "https://r.example/a;b"],
  ])("rejects an endpoint with %s", async (_label, reportEndpoint) => {
    await writeSite({ "index.html": page("<p>x</p>") });
    const error = await failure(
      writeHeadersFile(outDir, { reportOnly: true, reportEndpoint }),
    );
    expect(error.code).toBe("invalid-report-endpoint");
    await expect(readFile(join(outDir, "_headers"))).rejects.toThrow();
  });

  it("treats an empty endpoint as missing and accepts an uppercase scheme", async () => {
    await writeSite({ "index.html": page("<p>x</p>") });
    const error = await failure(
      writeHeadersFile(outDir, { reportOnly: true, reportEndpoint: "" }),
    );
    expect(error.code).toBe("report-endpoint-required");
    await writeHeadersFile(outDir, {
      reportOnly: true,
      reportEndpoint: "HTTPS://R.EXAMPLE/csp",
    });
    expect(await readFile(join(outDir, "_headers"), "utf8")).toContain(
      "report-uri HTTPS://R.EXAMPLE/csp",
    );
  });

  it("appends next to an existing enforced policy", async () => {
    const existing =
      "/*\n  Content-Security-Policy: default-src 'self'\n  X-Content-Type-Options: nosniff\n";
    await writeSite({ "index.html": page("<p>x</p>"), _headers: existing });
    await writeHeadersFile(outDir, {
      append: true,
      reportOnly: true,
      reportEndpoint: SENTRY_ENDPOINT,
    });
    const file = await readFile(join(outDir, "_headers"), "utf8");
    expect(file.startsWith(existing)).toBe(true);
    expect(file).toContain("  Content-Security-Policy-Report-Only: ");
    expect(file.match(/^\s+X-Content-Type-Options:/gm)).toHaveLength(1);
  });

  it("refuses to append when the existing file already sets Reporting-Endpoints", async () => {
    const existing =
      "/*\n  Reporting-Endpoints: csp-endpoint=\"/old\"\n  Content-Security-Policy: default-src 'self'\n";
    await writeSite({ "index.html": page("<p>x</p>"), _headers: existing });
    const error = await failure(
      writeHeadersFile(outDir, {
        append: true,
        reportOnly: true,
        reportEndpoint: "/csp-report",
      }),
    );
    expect(error.code).toBe("header-already-present");
    expect(await readFile(join(outDir, "_headers"), "utf8")).toBe(existing);
  });

  it("still refuses to append a second report-only policy", async () => {
    await writeSite({ "index.html": page("<p>x</p>") });
    const options = { reportOnly: true, reportEndpoint: "/csp-report" };
    await writeHeadersFile(outDir, options);
    const error = await failure(
      writeHeadersFile(outDir, { ...options, append: true }),
    );
    expect(error.code).toBe("header-already-present");
  });

  it("lists unhashable markup instead of throwing", async () => {
    await writeSite({
      "index.html": page('<p style="color:red">x</p>'),
      "about/index.html": page(
        '<button onclick="go()">x</button><a href="javascript:void(0)">y</a>',
      ),
      "clean.html": page("<p>ok</p>"),
    });
    const result = await writeHeadersFile(outDir, {
      reportOnly: true,
      reportEndpoint: "/csp-report",
    });
    expect(result.unhashable).toEqual([
      {
        file: "about/index.html",
        attributes: ["<a href>", "<button onclick>"],
      },
      { file: "index.html", attributes: ["<p style>"] },
    ]);
    expect(await readFile(join(outDir, "_headers"), "utf8")).toContain(
      "  Content-Security-Policy-Report-Only: ",
    );
  });

  it("leaves enforced mode unchanged: unhashable markup still throws and the result is empty", async () => {
    await writeSite({ "index.html": page('<p style="a">x</p>') });
    const error = await failure(writeHeadersFile(outDir));
    expect(error.code).toBe("unhashable-inline");
    await rm(join(outDir, "index.html"));
    await writeSite({ "index.html": page("<p>x</p>") });
    const result = await writeHeadersFile(outDir);
    expect(result.unhashable).toEqual([]);
  });
});

describe("findInlineSources", () => {
  it("hashes text as the browser sees it: CRLF becomes LF", () => {
    expect(
      findInlineSources("<script>\r\nvar a;\r\n</script>").scriptHashes,
    ).toEqual([sha256("\nvar a;\n")]);
  });

  it("is not thrown off by an element named inside a comment", () => {
    const html = "<!-- old <style> --><style>body{}</style>";
    expect(findInlineSources(html).styleHashes).toEqual([sha256("body{}")]);
  });

  it("hashes speculation rules and legacy JavaScript types", () => {
    const html = `<script type="speculationrules">{}</script><script type="text/jscript">a</script>`;
    expect(findInlineSources(html).scriptHashes).toHaveLength(2);
  });

  it("does not read src or type out of another attribute's value", () => {
    const html = `<script data-note="see src=x">a</script><script title=" type=text/template">b</script>`;
    expect(findInlineSources(html).scriptHashes).toHaveLength(2);
  });

  it.each([
    "java\tscript:x()",
    "java&#9;script:x()",
    "&#106;avascript:x()",
    "&#x6A;avascript:x()",
    "javascript&colon;x()",
    "  javascript:x()",
  ])("flags the obfuscated javascript: URL %s", (href) => {
    expect(findInlineSources(`<a href="${href}">a</a>`).unhashable).toEqual([
      "<a href>",
    ]);
  });

  it("flags javascript: URLs but not other URLs", () => {
    expect(
      findInlineSources('<a href="javascript:x()">a</a>').unhashable,
    ).toEqual(["<a href>"]);
    expect(
      findInlineSources('<a href="/javascript:x">a</a>').unhashable,
    ).toEqual([]);
  });

  it("hashes the exact text without trimming", () => {
    const content = "\n  var a = 1;\n";
    expect(
      findInlineSources(`<script>${content}</script>`).scriptHashes,
    ).toEqual([sha256(content)]);
  });

  it("handles attributes whose values contain '>'", () => {
    const html = `<script data-x="a>b">${BOOTSTRAP_SCRIPT}</script>`;
    expect(findInlineSources(html).scriptHashes).toEqual([
      sha256(BOOTSTRAP_SCRIPT),
    ]);
  });

  it("hashes import maps and skips non-executable types", () => {
    const html = `<script type="importmap">{}</script><script type="text/template">x</script>`;
    expect(findInlineSources(html).scriptHashes).toEqual([sha256("{}")]);
  });
});
