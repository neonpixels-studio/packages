import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeDifference } from "../src/template-sync/diff.ts";
import { TEMPLATE_FILES } from "../src/template-sync/manifest.ts";
import { preserveSections } from "../src/template-sync/markers.ts";
import { applyPackageFields } from "../src/template-sync/package-fields.ts";
import { runSyncTemplates } from "../src/template-sync/run.ts";

const TEMPLATES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
);
const SYNCED_ENGINES_RANGE = "^22.18.0 || ^24.0.0 || >=26.0.0";
const PREVIOUS_ENGINES_RANGE = "^22.17.0 || ^24.0.0 || >=26.0.0";
const PACKAGE_JSON = `${JSON.stringify(
  { name: "app", version: "1.2.3", scripts: { test: "vitest" } },
  null,
  2,
)}\n`;

let sandbox: string;
let repository: string;
let errors: string[];
let logs: string[];

function sync(args: string[]): number {
  return runSyncTemplates(args, {
    root: repository,
    templatesRoot: TEMPLATES_ROOT,
  });
}

function put(path: string, text: string): void {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), text);
}

function read(path: string): string {
  return readFileSync(join(repository, path), "utf8");
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "np-sync-templates-"));
  repository = join(sandbox, "repository");
  mkdirSync(repository);
  put("package.json", PACKAGE_JSON);
  errors = [];
  logs = [];
  vi.spyOn(console, "error").mockImplementation((line) => errors.push(line));
  vi.spyOn(console, "log").mockImplementation((line) => logs.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(sandbox, { recursive: true, force: true });
});

describe("copying templates", () => {
  it("creates every manifest file in an empty repository", () => {
    expect(sync(["--stack", "node"])).toBe(0);
    for (const path of TEMPLATE_FILES) {
      expect(existsSync(join(repository, path)), path).toBe(true);
    }
    expect(read(".nvmrc")).toBe("26.13.1\n");
  });

  it("overwrites a file that drifted from the template", () => {
    put(".nvmrc", "20\n");
    sync(["--stack", "node"]);
    expect(read(".nvmrc")).toBe("26.13.1\n");
  });

  it("changes nothing on a second run", () => {
    sync(["--stack", "node"]);
    logs.length = 0;
    expect(sync(["--stack", "node"])).toBe(0);
    expect(logs).toEqual(["np-sync-templates: already up to date."]);
  });

  it("uses a stack's own variant and falls back to the base", () => {
    sync(["--stack", "nuxt"]);
    expect(read(".husky/pre-push")).toContain("npx nuxt prepare");
    expect(read(".github/dependabot.yml")).not.toContain("vite-vitepress");

    sync(["--stack", "vitepress"]);
    expect(read(".husky/pre-push")).not.toContain("nuxt prepare");
    expect(read(".github/dependabot.yml")).toContain("vite-vitepress");
  });

  it("rejects a missing or unknown stack", () => {
    expect(sync([])).toBe(1);
    expect(sync(["--stack", "rails"])).toBe(1);
    expect(errors.join("\n")).toContain("--stack is required");
    expect(listFiles(repository)).toEqual(["package.json"]);
  });

  it("fails without a package.json and writes nothing", () => {
    rmSync(join(repository, "package.json"));
    expect(sync(["--stack", "node"])).toBe(1);
    expect(listFiles(repository)).toEqual([]);
  });
});

function npmGroups(dependabotConfig: string): {
  names: string[];
  body: string;
} {
  const npmEntry = dependabotConfig
    .split(/^ {2}- package-ecosystem: /m)
    .find((entry) => entry.startsWith("npm"));
  const groupsBlock = npmEntry?.split(/^ {4}groups:\n/m)[1] ?? "";
  const names = [...groupsBlock.matchAll(/^ {6}([\w-]+):$/gm)].map(
    (match) => match[1] ?? "",
  );
  return { names, body: groupsBlock };
}

describe("dependabot neon-pixels group", () => {
  it.each(["nuxt", "vitepress", "node"])(
    "is the first npm group, matches @neon-pixels/*, and has no update-types for %s",
    (stack) => {
      sync(["--stack", stack]);
      const { names, body } = npmGroups(read(".github/dependabot.yml"));
      expect(names[0]).toBe("neon-pixels");
      expect(names).toContain("minor-and-patch");
      if (stack === "vitepress") {
        expect(names.indexOf("minor-and-patch")).toBeLessThan(
          names.indexOf("vite-vitepress"),
        );
      }
      const neonBlock =
        (body.match(/^ {6}neon-pixels:\n((?: {8,}.*\n)*)/m) ?? [])[1] ?? "";
      expect(neonBlock).toContain('- "@neon-pixels/*"');
      expect(neonBlock).not.toContain("update-types");
    },
  );

  it("is reported by --check on the old template and applied alone by a sync", () => {
    const current = readFileSync(
      join(TEMPLATES_ROOT, "base", ".github", "dependabot.yml"),
      "utf8",
    );
    const oldTemplate = current.replace(
      / {6}# Listed first[\s\S]*?"@neon-pixels\/\*"\n/,
      "",
    );
    expect(oldTemplate).not.toContain("neon-pixels");
    sync(["--stack", "node"]);
    put(".github/dependabot.yml", oldTemplate);
    expect(sync(["--stack", "node", "--check"])).toBe(1);
    const diffLines = errors
      .join("\n")
      .split("\n")
      .filter((line) => /^[+-] /.test(line));
    expect(diffLines.length).toBeGreaterThan(0);
    expect(diffLines.every((line) => line.startsWith("+"))).toBe(true);
    expect(diffLines.join("\n")).toMatch(/neon-pixels:/);
    expect(read(".github/dependabot.yml")).toBe(oldTemplate);
    sync(["--stack", "node"]);
    expect(read(".github/dependabot.yml")).toBe(current);
  });
});

describe("package.json fields", () => {
  it("sets engines.node and leaves every other field alone", () => {
    sync(["--stack", "node"]);
    expect(JSON.parse(read("package.json"))).toEqual({
      name: "app",
      version: "1.2.3",
      scripts: { test: "vitest" },
      engines: { node: SYNCED_ENGINES_RANGE },
    });
  });

  it("keeps the tab indentation and missing trailing newline", () => {
    const text = applyPackageFields('{\n\t"name": "app"\n}', '{"a":{"b":1}}');
    expect(text).toBe('{\n\t"name": "app",\n\t"a": {\n\t\t"b": 1\n\t}\n}');
  });

  it("merges into an existing engines object without dropping its keys", () => {
    const text = applyPackageFields(
      '{"engines":{"npm":">=10","node":">=18"}}',
      '{"engines":{"node":">=22"}}',
    );
    expect(JSON.parse(text)).toEqual({
      engines: { npm: ">=10", node: ">=22" },
    });
  });

  it("returns the original text when the fields already match", () => {
    const text = '{ "engines": {"node": ">=22"} }';
    expect(applyPackageFields(text, '{"engines":{"node":">=22"}}')).toBe(text);
  });

  it("fails loudly on invalid JSON", () => {
    expect(() => applyPackageFields("{nope", "{}")).toThrow("not valid JSON");
  });

  it("pins the exact range, with the Node 22 floor at 22.18.0", () => {
    const range = JSON.parse(
      readFileSync(join(TEMPLATES_ROOT, "base/package-fields.json"), "utf8"),
    ).engines.node as string;
    expect(range).toBe(SYNCED_ENGINES_RANGE);
    expect(rangeAccepts(range, [22, 17, 0])).toBe(false);
    expect(rangeAccepts(range, [22, 18, 0])).toBe(true);
  });

  it("pins an engines range that accepts the pinned .nvmrc version", () => {
    const pinned = readFileSync(join(TEMPLATES_ROOT, "base/.nvmrc"), "utf8")
      .trim()
      .split(".")
      .map(Number);
    const range = JSON.parse(
      readFileSync(join(TEMPLATES_ROOT, "base/package-fields.json"), "utf8"),
    ).engines.node as string;
    expect(rangeAccepts(range, pinned)).toBe(true);
  });
});

function rangeAccepts(range: string, version: number[]): boolean {
  return range.split("||").some((part) => accepts(part.trim(), version));
}

/** Understands only the `^x.y.z` and `>=x.y.z` forms the template uses. */
function accepts(alternative: string, version: number[]): boolean {
  const match = /^(\^|>=)(.+)$/.exec(alternative);
  if (!match) {
    throw new Error(`accepts() does not understand "${alternative}"`);
  }
  const bound = match[2]!.split(".").map(Number);
  if (compareVersions(version, bound) < 0) {
    return false;
  }
  return match[1] === ">=" || version[0] === bound[0];
}

function compareVersions(left: number[], right: number[]): number {
  for (const index of [0, 1, 2]) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

describe("--check", () => {
  it("reports a repository on the old engines range, and a sync changes only engines.node", () => {
    const oldRepository = `${JSON.stringify(
      {
        name: "app",
        version: "1.2.3",
        scripts: { test: "vitest" },
        engines: { node: PREVIOUS_ENGINES_RANGE },
      },
      null,
      2,
    )}\n`;
    sync(["--stack", "node"]);
    put("package.json", oldRepository);
    expect(sync(["--stack", "node", "--check"])).toBe(1);
    const printed = errors.join("\n");
    expect(printed).toContain("package.json differs");
    expect(printed).toContain(
      "- " + '    "node": "^22.17.0 || ^24.0.0 || >=26.0.0"',
    );
    expect(printed).toContain(
      "+ " + '    "node": "^22.18.0 || ^24.0.0 || >=26.0.0"',
    );
    expect(read("package.json")).toBe(oldRepository);
    sync(["--stack", "node"]);
    expect(read("package.json")).toBe(
      oldRepository.replace("^22.17.0", "^22.18.0"),
    );
  });

  it("exits 0 for a synced repository", () => {
    sync(["--stack", "node"]);
    expect(sync(["--stack", "node", "--check"])).toBe(0);
    expect(errors).toEqual([]);
  });

  it("exits non-zero, prints a diff, and writes nothing", () => {
    sync(["--stack", "node"]);
    put(".nvmrc", "20\n");
    put("package.json", PACKAGE_JSON);
    const before = listFiles(repository).map((path) => [path, read(path)]);

    expect(sync(["--stack", "node", "--check"])).toBe(1);

    const printed = errors.join("\n");
    expect(printed).toContain(".nvmrc differs from the template");
    expect(printed).toContain("- 20");
    expect(printed).toContain("+ 26.13.1");
    expect(printed).toContain("package.json differs");
    expect(listFiles(repository).map((path) => [path, read(path)])).toEqual(
      before,
    );
  });

  it("reports a missing file", () => {
    sync(["--stack", "node"]);
    rmSync(join(repository, ".husky/post-merge"));
    expect(sync(["--stack", "node", "--check"])).toBe(1);
    expect(errors.join("\n")).toContain("(file is missing)");
    expect(existsSync(join(repository, ".husky/post-merge"))).toBe(false);
  });

  it("does not fail on a repo-specific section", () => {
    sync(["--stack", "node"]);
    put(
      ".gitleaks.toml",
      read(".gitleaks.toml").replace(
        "# np-sync:begin allowlist\n",
        '# np-sync:begin allowlist\ncommits = ["abc123"]\n',
      ),
    );
    expect(sync(["--stack", "node", "--check"])).toBe(0);
  });
});

describe("repo-specific sections", () => {
  const REPO_RULE = "[[rules]]\nid = \"app-token\"\nregex = '''tok_[a-z]+'''\n";

  it("keeps a section's lines and overwrites everything around it", () => {
    sync(["--stack", "node"]);
    put(
      ".gitleaks.toml",
      read(".gitleaks.toml")
        .replace(
          "# np-sync:begin extra-rules\n",
          `# np-sync:begin extra-rules\n${REPO_RULE}`,
        )
        .replace(
          "# np-sync:begin allowlist\n",
          '# np-sync:begin allowlist\ncommits = ["abc123"]\n',
        )
        .replace("useDefault = true", "useDefault = false"),
    );

    expect(sync(["--stack", "node"])).toBe(0);

    const result = read(".gitleaks.toml");
    expect(result).toContain(REPO_RULE);
    expect(result).toContain('commits = ["abc123"]');
    expect(result).toContain("useDefault = true");
  });

  it("preserves a hook's own steps", () => {
    put(
      ".husky/pre-push",
      "# old\n# np-sync:begin repo-specific\nnpm run e2e\n# np-sync:end repo-specific\nold command\n",
    );
    sync(["--stack", "node"]);
    expect(read(".husky/pre-push")).toContain(
      "# np-sync:begin repo-specific\nnpm run e2e\n# np-sync:end repo-specific",
    );
    expect(read(".husky/pre-push")).not.toContain("old command");
  });

  it("uses the template's default when the repository has no such section", () => {
    put(".gitleaks.toml", "useDefault = false\n");
    sync(["--stack", "node"]);
    expect(read(".gitleaks.toml")).toBe(
      readFileSync(join(TEMPLATES_ROOT, "base/.gitleaks.toml"), "utf8"),
    );
  });

  it("stops without writing anything when the repository's markers are broken", () => {
    put(".husky/pre-push", "# np-sync:begin repo-specific\nkeep me\n");
    expect(sync(["--stack", "node"])).toBe(1);
    expect(errors.join("\n")).toContain("never closed");
    expect(read(".husky/pre-push")).toBe(
      "# np-sync:begin repo-specific\nkeep me\n",
    );
    expect(existsSync(join(repository, ".nvmrc"))).toBe(false);
  });

  it("rejects nested, duplicate, and unmatched markers", () => {
    const begin = (name: string) => `# np-sync:begin ${name}\n`;
    const end = (name: string) => `# np-sync:end ${name}\n`;
    expect(() =>
      preserveSections("x\n", `${begin("a")}${begin("b")}`, "f"),
    ).toThrow("starts inside");
    expect(() =>
      preserveSections(
        "x\n",
        `${begin("a")}${end("a")}${begin("a")}${end("a")}`,
        "f",
      ),
    ).toThrow("appears twice");
    expect(() =>
      preserveSections("x\n", `${begin("custom")}keep\n${end("custom")}`, "f"),
    ).toThrow("not in the template");
    expect(preserveSections("x\n", `${begin("old")}${end("old")}`, "f")).toBe(
      "x\n",
    );
    expect(() => preserveSections("x\n", end("a"), "f")).toThrow(
      "unmatched end marker",
    );
    expect(() => preserveSections(begin("a"), null, "f")).toThrow(
      "never closed",
    );
  });
});

describe("what it touches", () => {
  it("leaves files outside the manifest alone", () => {
    put("README.md", "# app\n");
    put(".husky/custom-hook", "echo hi\n");
    put(".github/workflows/ci.yml", "name: ci\n");
    sync(["--stack", "node"]);
    expect(read("README.md")).toBe("# app\n");
    expect(read(".husky/custom-hook")).toBe("echo hi\n");
    expect(read(".github/workflows/ci.yml")).toBe("name: ci\n");
    expect(listFiles(repository)).toEqual(
      [
        ...TEMPLATE_FILES,
        "package.json",
        "README.md",
        ".husky/custom-hook",
        ".github/workflows/ci.yml",
      ].sort(),
    );
  });

  it("only copies files that are listed in the manifest", () => {
    const shipped = listFiles(TEMPLATES_ROOT)
      .map((path) => path.split("/").slice(1).join("/"))
      .filter((path) => path !== "package-fields.json");
    for (const path of shipped) {
      expect(TEMPLATE_FILES as readonly string[], path).toContain(path);
    }
  });

  it("refuses to write through a symlink that leaves the repository", () => {
    const outside = join(sandbox, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(repository, ".husky"));

    expect(sync(["--stack", "node"])).toBe(1);

    expect(errors.join("\n")).toContain("resolves outside the repository");
    expect(listFiles(outside)).toEqual([]);
  });
});

describe("symlinks", () => {
  it("refuses a dangling symlink that points outside the repository", () => {
    const outside = join(sandbox, "outside");
    mkdirSync(outside);
    symlinkSync(join(outside, "nvmrc"), join(repository, ".nvmrc"));

    expect(sync(["--stack", "node"])).toBe(1);

    expect(errors.join("\n")).toContain("symbolic link");
    expect(listFiles(outside)).toEqual([]);
  });
});

describe("a dangling directory symlink", () => {
  it("is refused with a clear message", () => {
    symlinkSync(join(sandbox, "missing"), join(repository, ".husky"));
    expect(sync(["--stack", "node"])).toBe(1);
    expect(errors.join("\n")).toContain("broken symbolic link");
  });
});

describe("a symlinked package.json", () => {
  it("is refused", () => {
    const outside = join(sandbox, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "package.json"), PACKAGE_JSON);
    rmSync(join(repository, "package.json"));
    symlinkSync(
      join(outside, "package.json"),
      join(repository, "package.json"),
    );

    expect(sync(["--stack", "node"])).toBe(1);

    expect(errors.join("\n")).toContain("symbolic link");
    expect(readFileSync(join(outside, "package.json"), "utf8")).toBe(
      PACKAGE_JSON,
    );
  });
});

describe("describeDifference", () => {
  it("lists removed and added lines and skips unchanged ones", () => {
    expect(describeDifference("a\nb\nc", "a\nx\nc\nd")).toEqual([
      "- b",
      "+ x",
      "+ d",
    ]);
  });

  it("reports nothing for equal text", () => {
    expect(describeDifference("a\nb", "a\nb")).toEqual([]);
  });
});
