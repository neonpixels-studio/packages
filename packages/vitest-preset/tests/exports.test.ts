import { describe, expect, it } from "vitest";
import nodePreset from "../node.js";
import nuxtPreset from "../nuxt.js";
import vitepressPreset from "../vitepress.js";

describe("presets", () => {
  it.each([
    ["node", nodePreset],
    ["vitepress", vitepressPreset],
    ["nuxt", nuxtPreset],
  ])(
    "%s accepts no options and carries no aliases or include globs",
    (_, preset) => {
      expect(preset).not.toBeInstanceOf(Function);
      expect(preset.resolve).toBeUndefined();
      expect(preset.test?.include).toBeUndefined();
    },
  );

  it.each([
    ["vitepress", vitepressPreset],
    ["nuxt", nuxtPreset],
  ])("%s hands each consumer a fresh Vue plugin instance", (_, preset) => {
    expect(preset.plugins).toHaveLength(1);
    expect(preset.plugins?.[0]).not.toBe(preset.plugins?.[0]);
  });

  it("gives node no DOM and no Vue plugin", () => {
    expect(nodePreset.test?.environment).toBe("node");
    expect(nodePreset.plugins).toBeUndefined();
    expect(nodePreset.test?.setupFiles).toBeUndefined();
  });
});
