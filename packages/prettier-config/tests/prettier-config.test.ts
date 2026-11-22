import { format } from "prettier";
import { describe, expect, it } from "vitest";
import defaultConfig from "../index.js";
import tailwindConfig from "../tailwind.js";

const HTML_FIXTURE = '<div class="p-4 flex items-center">hi</div>\n';
const SORTED_HTML = '<div class="flex items-center p-4">hi</div>\n';
const JS_FIXTURE = "const answer = {a:1,b:'two'}\n";
const DEFAULT_JS = 'const answer = { a: 1, b: "two" };\n';

describe("default entry point", () => {
  it("sets no options and no plugins", () => {
    expect(defaultConfig).toEqual({});
  });

  it("formats with Prettier defaults", async () => {
    const output = await format(JS_FIXTURE, {
      ...defaultConfig,
      parser: "babel",
    });
    expect(output).toBe(DEFAULT_JS);
  });

  it("leaves Tailwind class order alone", async () => {
    const output = await format(HTML_FIXTURE, {
      ...defaultConfig,
      parser: "html",
    });
    expect(output).toBe(HTML_FIXTURE);
  });
});

describe("/tailwind entry point", () => {
  it("adds only the Tailwind plugin to the defaults", () => {
    expect({ ...tailwindConfig, plugins: undefined }).toEqual({
      ...defaultConfig,
      plugins: undefined,
    });
    expect(tailwindConfig.plugins).toEqual([
      ...(defaultConfig.plugins ?? []),
      expect.any(String),
    ]);
    expect(String(tailwindConfig.plugins?.at(-1))).toContain(
      "prettier-plugin-tailwindcss",
    );
  });

  it("sorts Tailwind classes", async () => {
    const output = await format(HTML_FIXTURE, {
      ...tailwindConfig,
      parser: "html",
    });
    expect(output).toBe(SORTED_HTML);
  });

  it("formats non-class code like the default entry point", async () => {
    const output = await format(JS_FIXTURE, {
      ...tailwindConfig,
      parser: "babel",
    });
    expect(output).toBe(DEFAULT_JS);
  });
});
