import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devices } from "@playwright/test";
import { createPlaywrightConfig } from "../index.js";
import {
  AUTH_STATE_FILE,
  applyClerkEnvironment,
  authenticate,
  createClerkPlaywrightConfig,
} from "../clerk.js";

const OPTIONS = { command: "pnpm dev --port 4123", port: 4123 };
const BASE_URL = "http://localhost:4123";
const CLERK_VARIABLES = [
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "NUXT_CLERK_SECRET_KEY",
  "NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
];

const originalCi = process.env.CI;
const originalClerk = Object.fromEntries(
  CLERK_VARIABLES.map((name) => [name, process.env[name]]),
);

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

beforeEach(() => {
  delete process.env.CI;
  for (const name of CLERK_VARIABLES) {
    delete process.env[name];
  }
});

afterEach(() => {
  restore("CI", originalCi);
  for (const [name, value] of Object.entries(originalClerk)) {
    restore(name, value);
  }
});

describe("createPlaywrightConfig", () => {
  it("generates the local config", () => {
    expect(createPlaywrightConfig(OPTIONS)).toEqual({
      forbidOnly: false,
      retries: 0,
      reporter: [["list"], ["html", { open: "never" }]],
      use: { baseURL: BASE_URL, trace: "on-first-retry" },
      projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
      webServer: {
        command: OPTIONS.command,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
    });
  });

  it("retries, forbids .only, and starts a fresh server in CI", () => {
    process.env.CI = "true";
    const config = createPlaywrightConfig(OPTIONS);

    expect(config.retries).toBe(2);
    expect(config.forbidOnly).toBe(true);
    expect(config.reporter).toEqual([["github"], ["html", { open: "never" }]]);
    expect(config.webServer).toMatchObject({ reuseExistingServer: false });
  });

  it("takes the command and port from the caller", () => {
    const config = createPlaywrightConfig({
      command: "node serve.js",
      port: 8080,
    });

    expect(config.use?.baseURL).toBe("http://localhost:8080");
    expect(config.webServer).toMatchObject({
      command: "node serve.js",
      url: "http://localhost:8080",
    });
  });

  it("passes web server env through only when given", () => {
    expect(createPlaywrightConfig(OPTIONS).webServer).not.toHaveProperty("env");
    expect(
      createPlaywrightConfig({ ...OPTIONS, env: { SENTRY_DSN: "" } }).webServer,
    ).toMatchObject({ env: { SENTRY_DSN: "" } });
  });

  it.each([undefined, 0, -1, 70000, 3000.5, Number.NaN])(
    "rejects port %s, since it has no default",
    (port) => {
      expect(() =>
        createPlaywrightConfig({ command: "x", port } as never),
      ).toThrow(/"port"/);
    },
  );

  it.each([undefined, "", "   "])("rejects command %j", (command) => {
    expect(() =>
      createPlaywrightConfig({ command, port: 3000 } as never),
    ).toThrow(/"command"/);
  });
});

describe("createClerkPlaywrightConfig", () => {
  it("is the base config plus a setup project and an authenticated browser project", () => {
    const base = createPlaywrightConfig(OPTIONS);
    const config = createClerkPlaywrightConfig(OPTIONS);

    expect({ ...config, projects: undefined }).toEqual({
      ...base,
      projects: undefined,
    });
    expect(config.projects).toEqual([
      { name: "setup", testMatch: /auth\.setup\.[cm]?[jt]s$/ },
      {
        name: "chromium",
        dependencies: ["setup"],
        testIgnore: /auth\.setup\.[cm]?[jt]s$/,
        use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE_FILE },
      },
    ]);
  });

  it("maps the Nuxt Clerk variables while building the config", () => {
    process.env.NUXT_CLERK_SECRET_KEY = "sk_test_nuxt";
    process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_nuxt";

    createClerkPlaywrightConfig(OPTIONS);

    expect(process.env.CLERK_SECRET_KEY).toBe("sk_test_nuxt");
    expect(process.env.CLERK_PUBLISHABLE_KEY).toBe("pk_test_nuxt");
  });
});

describe("applyClerkEnvironment", () => {
  it("copies Nuxt names onto the Clerk names", () => {
    const env: Record<string, string | undefined> = {
      NUXT_CLERK_SECRET_KEY: "sk",
      NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk",
    };
    applyClerkEnvironment(env);

    expect(env.CLERK_SECRET_KEY).toBe("sk");
    expect(env.CLERK_PUBLISHABLE_KEY).toBe("pk");
  });

  it("never overwrites a Clerk name that is already set", () => {
    const env: Record<string, string | undefined> = {
      CLERK_SECRET_KEY: "existing",
      NUXT_CLERK_SECRET_KEY: "nuxt",
    };
    applyClerkEnvironment(env);

    expect(env.CLERK_SECRET_KEY).toBe("existing");
  });

  it("leaves the Clerk names unset when the Nuxt names are missing", () => {
    const env: Record<string, string | undefined> = {};
    applyClerkEnvironment(env);

    expect(env).toEqual({});
  });
});

describe("authenticate", () => {
  const SETUP_OPTIONS = {
    emailAddress: "e2e@example.com",
    signInPath: "/login",
    protectedPath: "/dashboard",
  };

  function createFakes(redirectTo?: string) {
    const calls: string[] = [];
    let currentUrl = "http://localhost/";
    const page = {
      goto: async (target: string) => {
        calls.push(`goto ${target}`);
        currentUrl = new URL(redirectTo ?? target, "http://localhost").href;
      },
      url: () => currentUrl,
      context: () => ({
        storageState: async (options: { path: string }) => {
          calls.push(`storageState ${options.path}`);
        },
      }),
    };
    const clerkTesting = {
      clerkSetup: async () => {
        calls.push("clerkSetup");
      },
      clerk: {
        signIn: async (options: { emailAddress: string }) => {
          calls.push(`signIn ${options.emailAddress}`);
        },
      },
    };
    return { calls, page, clerkTesting };
  }

  it("sets up Clerk, signs in, confirms the session, then saves state", async () => {
    const { calls, page, clerkTesting } = createFakes();
    await authenticate({ ...SETUP_OPTIONS, page, clerkTesting } as never);

    expect(calls).toEqual([
      "clerkSetup",
      "goto /login",
      "signIn e2e@example.com",
      "goto /dashboard",
      `storageState ${AUTH_STATE_FILE}`,
    ]);
  });

  it("does not save state when a signed-out redirect lands on the sign-in page", async () => {
    const { calls, page, clerkTesting } = createFakes(
      "/login?redirect=/dashboard",
    );

    await expect(
      authenticate({ ...SETUP_OPTIONS, page, clerkTesting } as never),
    ).rejects.toThrow("landed on /login");
    expect(calls.some((call) => call.startsWith("storageState"))).toBe(false);
  });

  it("does not save state when Clerk setup fails", async () => {
    const { calls, page, clerkTesting } = createFakes();
    clerkTesting.clerkSetup = async () => {
      throw new Error("missing CLERK_SECRET_KEY");
    };

    await expect(
      authenticate({ ...SETUP_OPTIONS, page, clerkTesting } as never),
    ).rejects.toThrow("missing CLERK_SECRET_KEY");
    expect(calls).toEqual([]);
  });
});
