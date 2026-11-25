import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addNonceToScriptTags,
  addNonceToScripts,
  generateCspNonce,
  nonceForContext,
} from "../src/index.ts";

const NONCE = "bm9uY2UtcGxhY2Vob2xkZXI=";

describe("addNonceToScripts", () => {
  it("sets the nonce on every script opening tag", () => {
    const html =
      '<script src="/a.js"></script><script>window.a = 1;</script><script type="module" async></script>';
    expect(addNonceToScripts(html, NONCE)).toBe(
      `<script nonce="${NONCE}" src="/a.js"></script><script nonce="${NONCE}">window.a = 1;</script><script nonce="${NONCE}" type="module" async></script>`,
    );
  });

  it("replaces an existing nonce and keeps every other attribute", () => {
    const html =
      "<script nonce='old' src=\"/a.js\" data-x='1 > 0' defer NONCE=stale type=module></script>";
    expect(addNonceToScripts(html, NONCE)).toBe(
      `<script nonce="${NONCE}" src="/a.js" data-x='1 > 0' defer type=module></script>`,
    );
  });

  it("matches the tag name case-insensitively", () => {
    expect(addNonceToScripts("<SCRIPT src=x></SCRIPT>", NONCE)).toBe(
      `<script nonce="${NONCE}" src=x></SCRIPT>`,
    );
  });

  it("leaves tags that only start with the word script alone", () => {
    const html = "<scripted></scripted><script-element></script-element>";
    expect(addNonceToScripts(html, NONCE)).toBe(html);
  });

  it("does not touch tag-like text inside a script body", () => {
    const html =
      '<script>const a = "<script>"; const b = "<script src=x>";</script>';
    expect(addNonceToScripts(html, NONCE)).toBe(
      `<script nonce="${NONCE}">const a = "<script>"; const b = "<script src=x>";</script>`,
    );
  });

  it("does not touch tag-like text inside attribute values", () => {
    const html =
      '<meta content="<script>alert(1)</script>"><div title=\'<script src="x">\'></div><script></script>';
    expect(addNonceToScripts(html, NONCE)).toBe(
      `<meta content="<script>alert(1)</script>"><div title='<script src="x">'></div><script nonce="${NONCE}"></script>`,
    );
  });

  it("does not touch tag-like text in comments, styles, or textareas", () => {
    const html =
      "<!-- <script> --><style>a::after{content:'<script>'}</style><textarea><script></textarea><script></script>";
    expect(addNonceToScripts(html, NONCE)).toBe(
      `<!-- <script> --><style>a::after{content:'<script>'}</style><textarea><script></textarea><script nonce="${NONCE}"></script>`,
    );
  });

  it("stamps a script that follows a script body containing a closing-tag lookalike", () => {
    const html = '<script>"</scripts>"</script><script></script>';
    expect(addNonceToScripts(html, NONCE)).toBe(
      `<script nonce="${NONCE}">"</scripts>"</script><script nonce="${NONCE}"></script>`,
    );
  });

  it("returns text and unterminated markup unchanged", () => {
    expect(addNonceToScripts("", NONCE)).toBe("");
    expect(addNonceToScripts("a < b and c", NONCE)).toBe("a < b and c");
    expect(addNonceToScripts('<script src="x', NONCE)).toBe('<script src="x');
    expect(addNonceToScripts("<script>unclosed", NONCE)).toBe(
      `<script nonce="${NONCE}">unclosed`,
    );
  });

  it.each(["", 'a"b', "a b", "a>b", "a;b", "<x>", "a'b"])(
    "rejects the nonce %j",
    (nonce) => {
      expect(() => addNonceToScripts("<script></script>", nonce)).toThrow(
        TypeError,
      );
    },
  );
});

describe("addNonceToScriptTags", () => {
  it("sets the nonce on every script tag in every position", () => {
    const tags = [
      { tag: "script", tagPosition: "head", props: { src: "/a.js" } },
      { tag: "meta", props: { name: "x" } },
      { tag: "script", tagPosition: "bodyOpen", props: { nonce: "old" } },
      { tag: "script", tagPosition: "bodyClose", props: {} },
    ];
    addNonceToScriptTags(tags, NONCE);
    expect(tags.map((entry) => entry.props.nonce)).toEqual([
      NONCE,
      undefined,
      NONCE,
      NONCE,
    ]);
    expect(tags[0]?.props.src).toBe("/a.js");
  });

  it("rejects a nonce that is not base64", () => {
    expect(() =>
      addNonceToScriptTags([{ tag: "script", props: {} }], 'a"b'),
    ).toThrow(TypeError);
  });
});

describe("nonceForContext", () => {
  it("creates a base64 nonce once and returns it again", () => {
    const context: Record<string, unknown> = {};
    const first = nonceForContext(context);
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonceForContext(context)).toBe(first);
  });

  it("gives each context its own nonce", () => {
    expect(nonceForContext({})).not.toBe(nonceForContext({}));
  });

  it("returns a nonce already stored on the context", () => {
    expect(nonceForContext({ cspNonce: NONCE })).toBe(NONCE);
  });

  it("replaces a stored value that is not a safe nonce", () => {
    const context: Record<string, unknown> = { cspNonce: 'a"b' };
    const nonce = nonceForContext(context);
    expect(nonce).not.toBe('a"b');
    expect(context.cspNonce).toBe(nonce);
  });
});

describe("edge runtime safety", () => {
  const edgeSafeModules = [
    "csp.ts",
    "nonce.ts",
    "nuxt.ts",
    "origins.ts",
    "reporting.ts",
  ];

  it.each(edgeSafeModules)(
    "%s imports no Node built-in, framework, or Buffer",
    (file) => {
      const source = readFileSync(
        new URL(`../src/${file}`, import.meta.url),
        "utf8",
      );
      expect(source).not.toMatch(/from "node:|require\(|\bBuffer\b/);
      expect(source).not.toMatch(/from "(nuxt|nitropack|nitro|h3|unhead)/);
    },
  );

  it("generates a nonce with Web Crypto", () => {
    expect(generateCspNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
