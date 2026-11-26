import { describe, expect, it, vi } from "vitest";
import {
  createAppearanceController,
  createAppearanceStorage,
  createSyncRegistry,
  type AppearanceState,
  type AppearanceSyncAdapter,
  type BrowserWindow,
  type StorageEventLike,
} from "../shared/lib/index.ts";
import { CONFIG, memoryStorage, NO_ACCENT_CONFIG } from "./helpers.ts";

function fakeBrowser(systemDark = false) {
  const classes = new Set<string>();
  const attributes = new Map<string, string>();
  const root = {
    classList: {
      toggle: (name: string, force: boolean) => {
        if (force) {
          classes.add(name);
          return;
        }
        classes.delete(name);
      },
    },
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
  };
  const mediaListeners = new Set<() => void>();
  const storageListeners = new Set<(event: StorageEventLike) => void>();
  const query = {
    matches: systemDark,
    addEventListener: (_type: "change", listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_type: "change", listener: () => void) =>
      mediaListeners.delete(listener),
  };
  const browser = {
    document: { documentElement: root },
    matchMedia: () => query,
    addEventListener: (
      _type: "storage",
      listener: (event: StorageEventLike) => void,
    ) => storageListeners.add(listener),
    removeEventListener: (
      _type: "storage",
      listener: (event: StorageEventLike) => void,
    ) => storageListeners.delete(listener),
  } as unknown as BrowserWindow;
  return {
    browser,
    classes,
    attributes,
    mediaListeners,
    storageListeners,
    setSystemDark(value: boolean) {
      query.matches = value;
      mediaListeners.forEach((listener) => listener());
    },
    fireStorage(event: StorageEventLike) {
      storageListeners.forEach((listener) => listener(event));
    },
  };
}

function setup(
  stored: Record<string, string> = {},
  config = CONFIG,
  adapter?: AppearanceSyncAdapter,
) {
  const backing = memoryStorage(stored);
  const state: AppearanceState = {
    theme: { value: "system" },
    accent: { value: config.defaultAccent },
    systemDark: { value: false },
  };
  const sync = createSyncRegistry();
  if (adapter) {
    sync.define(adapter);
  }
  const warn = vi.fn();
  const controller = createAppearanceController({
    config,
    state,
    storage: createAppearanceStorage(config, () => backing),
    sync,
    warn,
  });
  return { controller, state, backing, warn };
}

describe("starting in the browser", () => {
  it("applies the stored values after hydration", () => {
    const { controller, state } = setup({
      "fixture:theme": "dark",
      "fixture:accent": "teal",
    });
    const page = fakeBrowser();
    controller.start(page.browser);
    expect(state.theme.value).toBe("dark");
    expect(state.accent.value).toBe("teal");
    expect(page.classes.has("dark")).toBe(true);
    expect(page.attributes.get("data-accent")).toBe("teal");
  });

  it("defaults to the system theme and the default accent", () => {
    const { controller, state } = setup();
    const page = fakeBrowser(true);
    controller.start(page.browser);
    expect(state.theme.value).toBe("system");
    expect(state.accent.value).toBe("violet");
    expect(page.classes.has("dark")).toBe(true);
  });

  it("follows the operating system live while the theme is system", () => {
    const { controller, state } = setup();
    const page = fakeBrowser(false);
    controller.start(page.browser);
    page.setSystemDark(true);
    expect(state.systemDark.value).toBe(true);
    expect(page.classes.has("dark")).toBe(true);
    controller.setTheme("light");
    page.setSystemDark(false);
    page.setSystemDark(true);
    expect(page.classes.has("dark")).toBe(false);
  });

  it("stops listening when the returned function is called", () => {
    const { controller } = setup();
    const page = fakeBrowser();
    controller.start(page.browser)();
    expect(page.mediaListeners.size).toBe(0);
    expect(page.storageListeners.size).toBe(0);
  });

  it("never sets the accent attribute for an app without accents", () => {
    const { controller } = setup({}, NO_ACCENT_CONFIG);
    const page = fakeBrowser();
    controller.start(page.browser);
    expect(page.attributes.size).toBe(0);
  });
});

describe("changing the appearance", () => {
  it("updates the document, the state, and storage at once", () => {
    const { controller, state, backing } = setup();
    const page = fakeBrowser();
    controller.start(page.browser);
    controller.setTheme("dark");
    controller.setAccent("amber");
    expect(page.classes.has("dark")).toBe(true);
    expect(page.attributes.get("data-accent")).toBe("amber");
    expect(state.theme.value).toBe("dark");
    expect(backing.values.get("fixture:theme")).toBe("dark");
    expect(backing.values.get("fixture:accent")).toBe("amber");
  });

  it("ignores an accent that is not in the list", () => {
    const { controller, state, backing } = setup();
    controller.setAccent("pink");
    expect(state.accent.value).toBe("violet");
    expect(backing.values.size).toBe(0);
  });

  it("cycles light, dark, system", () => {
    const { controller, state } = setup();
    controller.setTheme("light");
    controller.cycleTheme();
    expect(state.theme.value).toBe("dark");
    controller.cycleTheme();
    expect(state.theme.value).toBe("system");
    controller.cycleTheme();
    expect(state.theme.value).toBe("light");
  });

  it("changes state on the server without touching a document", () => {
    const { controller, state } = setup();
    expect(() => controller.setTheme("dark")).not.toThrow();
    expect(state.theme.value).toBe("dark");
  });
});

describe("a change made in another tab", () => {
  it("is applied in this one", () => {
    const { controller, state } = setup();
    const page = fakeBrowser();
    controller.start(page.browser);
    page.fireStorage({ key: "fixture:theme", newValue: "dark" });
    page.fireStorage({ key: "fixture:accent", newValue: "teal" });
    expect(state.theme.value).toBe("dark");
    expect(page.classes.has("dark")).toBe(true);
    expect(page.attributes.get("data-accent")).toBe("teal");
  });

  it("resets to the defaults when the other tab clears the value", () => {
    const { controller, state } = setup({ "fixture:theme": "dark" });
    const page = fakeBrowser();
    controller.start(page.browser);
    page.fireStorage({ key: "fixture:theme", newValue: null });
    expect(state.theme.value).toBe("system");
  });

  it("ignores other keys", () => {
    const { controller, state } = setup();
    const page = fakeBrowser();
    controller.start(page.browser);
    page.fireStorage({ key: "other:theme", newValue: "dark" });
    expect(state.theme.value).toBe("system");
  });
});

describe("the sync adapter", () => {
  function adapter(loaded: Awaited<ReturnType<AppearanceSyncAdapter["load"]>>) {
    return {
      load: vi.fn(async () => loaded),
      save: vi.fn(async () => undefined),
    };
  }

  it("lets the account's values win over the device's", async () => {
    const fake = adapter({ theme: "light", accent: "amber" });
    const { controller, state, backing } = setup(
      { "fixture:theme": "dark" },
      CONFIG,
      fake,
    );
    const page = fakeBrowser();
    controller.start(page.browser);
    await controller.syncFromAccount();
    expect(fake.load).toHaveBeenCalledOnce();
    expect(state.theme.value).toBe("light");
    expect(state.accent.value).toBe("amber");
    expect(backing.values.get("fixture:theme")).toBe("light");
    expect(page.classes.has("dark")).toBe(false);
    expect(fake.save).not.toHaveBeenCalled();
  });

  it("keeps the device's values when the account has none", async () => {
    const fake = adapter(null);
    const { controller, state } = setup(
      { "fixture:theme": "dark" },
      CONFIG,
      fake,
    );
    controller.start(fakeBrowser().browser);
    await controller.syncFromAccount();
    expect(state.theme.value).toBe("dark");
  });

  it("ignores invalid values from the account", async () => {
    const fake = adapter({ theme: "purple" as never, accent: "pink" });
    const { controller, state } = setup({}, CONFIG, fake);
    await controller.syncFromAccount();
    expect(state.theme.value).toBe("system");
    expect(state.accent.value).toBe("violet");
  });

  it("warns instead of throwing when load fails", async () => {
    const fake = {
      load: vi.fn(async () => {
        throw new Error("offline");
      }),
      save: vi.fn(async () => undefined),
    };
    const { controller, warn } = setup({}, CONFIG, fake);
    await expect(controller.syncFromAccount()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("saves the newest values and keeps the device value when save fails", async () => {
    const fake = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => {
        throw new Error("offline");
      }),
    };
    const { controller, state, warn } = setup({}, CONFIG, fake);
    controller.setTheme("dark");
    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
    expect(fake.save).toHaveBeenCalledWith({ theme: "dark", accent: "violet" });
    expect(state.theme.value).toBe("dark");
  });

  it("works from the device alone with no adapter", async () => {
    const { controller, state } = setup();
    await expect(controller.syncFromAccount()).resolves.toBeUndefined();
    controller.setTheme("dark");
    expect(state.theme.value).toBe("dark");
  });

  it("throws when an adapter is defined twice", () => {
    const sync = createSyncRegistry();
    sync.define(adapter(null));
    expect(() => sync.define(adapter(null))).toThrow(/called twice/);
  });

  it("rejects an adapter without load and save", () => {
    expect(() =>
      createSyncRegistry().define({} as AppearanceSyncAdapter),
    ).toThrow(/load and a save/);
  });
});

describe("edge cases found in review", () => {
  it("calls save as a method of the adapter", async () => {
    class ClassAdapter implements AppearanceSyncAdapter {
      saved: unknown[] = [];
      async load() {
        return null;
      }
      async save(values: unknown) {
        this.saved.push(values);
      }
    }
    const adapter = new ClassAdapter();
    const { controller, warn } = setup({}, CONFIG, adapter);
    controller.setTheme("dark");
    await vi.waitFor(() => expect(adapter.saved).toHaveLength(1));
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps a choice made while load was running", async () => {
    let finishLoad: (value: { theme: "light" }) => void = () => undefined;
    const adapter = {
      load: () =>
        new Promise<{ theme: "light" }>((resolve) => {
          finishLoad = resolve;
        }),
      save: vi.fn(async () => undefined),
    };
    const { controller, state } = setup({}, CONFIG, adapter);
    const loading = controller.syncFromAccount();
    controller.setTheme("dark");
    finishLoad({ theme: "light" });
    await loading;
    expect(state.theme.value).toBe("dark");
  });

  it("resets when another tab clears all of storage", () => {
    const { controller, state } = setup({
      "fixture:theme": "dark",
      "fixture:accent": "teal",
    });
    const page = fakeBrowser();
    controller.start(page.browser);
    page.fireStorage({ key: null, newValue: null });
    expect(state.theme.value).toBe("system");
    expect(state.accent.value).toBe("violet");
    expect(page.classes.has("dark")).toBe(false);
  });
});

describe("an app without accents", () => {
  it("ignores accent events from other tabs", () => {
    const { controller } = setup({}, NO_ACCENT_CONFIG);
    const page = fakeBrowser();
    controller.start(page.browser);
    page.fireStorage({ key: "plain:accent", newValue: "teal" });
    expect(page.attributes.size).toBe(0);
  });

  it("keeps a newer tab's choice over a load still in flight", async () => {
    let finishLoad: (value: { theme: "light" }) => void = () => undefined;
    const adapter = {
      load: () =>
        new Promise<{ theme: "light" }>((resolve) => {
          finishLoad = resolve;
        }),
      save: vi.fn(async () => undefined),
    };
    const { controller, state } = setup({}, CONFIG, adapter);
    const page = fakeBrowser();
    controller.start(page.browser);
    const loading = controller.syncFromAccount();
    page.fireStorage({ key: "fixture:theme", newValue: "dark" });
    finishLoad({ theme: "light" });
    await loading;
    expect(state.theme.value).toBe("dark");
  });
});

describe("account values that arrive before hydration", () => {
  it("wait for start so the first client render matches the server", async () => {
    const adapter = {
      load: vi.fn(async () => ({ theme: "dark" as const })),
      save: vi.fn(async () => undefined),
    };
    const { controller, state } = setup({}, CONFIG, adapter);
    await controller.syncFromAccount();
    expect(state.theme.value).toBe("system");
    controller.start(fakeBrowser().browser);
    expect(state.theme.value).toBe("dark");
  });
});
