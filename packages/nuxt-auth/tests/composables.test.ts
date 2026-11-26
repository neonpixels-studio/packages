import { computed, effectScope, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_RESOLVE_TIMEOUT_MS } from "../shared/lib/auth-resolved.ts";
import { createAuthResolved } from "../app/internal/authResolved.ts";
import { createDeferredClerk } from "../app/internal/deferredClerk.ts";

const clerk = vi.hoisted(() => ({
  auth: { isLoaded: { value: false }, getToken: { value: vi.fn() } },
  user: { isLoaded: { value: false } },
  instance: { value: null as unknown },
  useAuth: vi.fn(),
  useUser: vi.fn(),
  useClerk: vi.fn(),
}));

vi.mock("@clerk/nuxt/composables", () => ({
  useAuth: clerk.useAuth,
  useUser: clerk.useUser,
  useClerk: clerk.useClerk,
}));

function stubNuxtApp(clerkDeferral: unknown): void {
  vi.stubGlobal("useNuxtApp", () => ({ $clerkDeferral: clerkDeferral }));
}

beforeEach(() => {
  clerk.useAuth.mockReturnValue(clerk.auth);
  clerk.useUser.mockReturnValue(clerk.user);
  clerk.useClerk.mockReturnValue(clerk.instance);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the deferred stand-ins", () => {
  it("report a settled signed-out state", async () => {
    const { auth, user, clerk: instance } = createDeferredClerk();
    expect(auth.isLoaded.value).toBe(true);
    expect(auth.isSignedIn.value).toBe(false);
    expect(auth.userId.value).toBeNull();
    expect(auth.sessionId.value).toBeNull();
    expect(auth.has.value({ permission: "org:x:y" })).toBe(false);
    expect(await auth.getToken.value()).toBeNull();
    await expect(auth.signOut.value()).resolves.toBeUndefined();
    expect(user.isLoaded.value).toBe(true);
    expect(user.isSignedIn.value).toBe(false);
    expect(user.user.value).toBeNull();
    expect(instance.value).toBeNull();
  });
});

describe.each([
  ["useClerkAuth", "useClerkAuth", "useAuth", "auth"],
  ["useClerkUser", "useClerkUser", "useUser", "user"],
  ["useClerkInstance", "useClerkInstance", "useClerk", "clerk"],
] as const)("%s", (_label, fileName, clerkName, standInKey) => {
  async function load() {
    const module = await import(`../app/composables/${fileName}.ts`);
    return module[fileName] as () => unknown;
  }

  it("returns Clerk's own value when Clerk is installed", async () => {
    stubNuxtApp(null);
    const composable = await load();
    const expected = {
      useAuth: clerk.auth,
      useUser: clerk.user,
      useClerk: clerk.instance,
    }[clerkName];
    expect(composable()).toBe(expected);
    expect(clerk[clerkName]).toHaveBeenCalledTimes(1);
  });

  it("returns the settled signed-out value on a deferred page, without calling Clerk", async () => {
    const deferral = createDeferredClerk();
    stubNuxtApp(deferral);
    const composable = await load();
    expect(composable()).toBe(deferral[standInKey]);
    expect(clerk[clerkName]).not.toHaveBeenCalled();
  });
});

describe("useSignOut", () => {
  async function setUp(signOut: () => Promise<void>) {
    clerk.useAuth.mockReturnValue({
      ...clerk.auth,
      signOut: { value: signOut },
    });
    stubNuxtApp(null);
    const { useSignOut } = await import("../app/composables/useSignOut.ts");
    return useSignOut();
  }

  it("starts idle with no error", async () => {
    const { signOutStatus, signOutError } = await setUp(async () => undefined);
    expect(signOutStatus.value).toBe("idle");
    expect(signOutError.value).toBeNull();
  });

  it("is signingOut while Clerk signs out, then idle", async () => {
    let finish: () => void = () => undefined;
    const { signOut, signOutStatus } = await setUp(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const pending = signOut();
    expect(signOutStatus.value).toBe("signingOut");
    finish();
    await pending;
    expect(signOutStatus.value).toBe("idle");
  });

  it("sets the error and never throws when sign-out fails", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { signOut, signOutStatus, signOutError } = await setUp(async () => {
      throw new Error("network");
    });
    await expect(signOut()).resolves.toBeUndefined();
    expect(signOutStatus.value).toBe("error");
    expect(signOutError.value).toBe("Couldn't sign out. Please try again.");
    expect(logged).toHaveBeenCalledWith("Sign-out failed", expect.any(Error));
    logged.mockRestore();
  });

  it("ignores a second sign-out while one is in progress", async () => {
    let finish: () => void = () => undefined;
    const clerkSignOut = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const { signOut } = await setUp(clerkSignOut);
    const first = signOut();
    const second = signOut();
    finish();
    await Promise.all([first, second]);
    expect(clerkSignOut).toHaveBeenCalledTimes(1);
  });

  it("clears an earlier error when it is tried again", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let fail = true;
    const { signOut, signOutStatus, signOutError } = await setUp(async () => {
      if (fail) {
        throw new Error("network");
      }
    });
    await signOut();
    fail = false;
    await signOut();
    expect(signOutError.value).toBeNull();
    expect(signOutStatus.value).toBe("idle");
    logged.mockRestore();
  });
});

describe("useAuthHeaders", () => {
  async function setUp(
    getToken: (options?: unknown) => Promise<string | null>,
  ) {
    clerk.useAuth.mockReturnValue({
      ...clerk.auth,
      getToken: { value: getToken },
    });
    stubNuxtApp(null);
    const { useAuthHeaders } =
      await import("../app/composables/useAuthHeaders.ts");
    return useAuthHeaders();
  }

  it("builds the Authorization header from the session token", async () => {
    const { buildAuthHeaders } = await setUp(async () => "abc");
    expect(await buildAuthHeaders()).toEqual({ Authorization: "Bearer abc" });
  });

  it("asks Clerk for a cached token by default and a fresh one with skipCache", async () => {
    const getToken = vi.fn(async () => "abc");
    const { buildAuthHeaders } = await setUp(getToken);
    await buildAuthHeaders();
    await buildAuthHeaders({ skipCache: true });
    expect(getToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
  });

  it("returns no header when there is no token", async () => {
    const { buildAuthHeaders } = await setUp(async () => null);
    expect(await buildAuthHeaders()).toEqual({});
  });

  it("returns no header on a deferred page", async () => {
    stubNuxtApp(createDeferredClerk());
    const { useAuthHeaders } =
      await import("../app/composables/useAuthHeaders.ts");
    expect(await useAuthHeaders().buildAuthHeaders()).toEqual({});
    expect(clerk.useAuth).not.toHaveBeenCalled();
  });

  it("returns no header when the token never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { buildAuthHeaders } = await setUp(
        () => new Promise(() => undefined),
      );
      const pending = buildAuthHeaders();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createAuthResolved", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits two seconds", () => {
    expect(AUTH_RESOLVE_TIMEOUT_MS).toBe(2000);
  });

  it("becomes true when Clerk loads", async () => {
    const isLoaded = ref(false);
    const resolved = createAuthResolved({
      isLoaded,
      isServer: false,
      timeoutMs: AUTH_RESOLVE_TIMEOUT_MS,
    });
    expect(resolved.value).toBe(false);
    isLoaded.value = true;
    await nextTick();
    expect(resolved.value).toBe(true);
  });

  it("becomes true after the timeout when Clerk has not loaded", async () => {
    const resolved = createAuthResolved({
      isLoaded: ref(false),
      isServer: false,
      timeoutMs: AUTH_RESOLVE_TIMEOUT_MS,
    });
    await vi.advanceTimersByTimeAsync(AUTH_RESOLVE_TIMEOUT_MS - 1);
    expect(resolved.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved.value).toBe(true);
  });

  it("is true at once on the server and starts no timer", () => {
    const resolved = createAuthResolved({
      isLoaded: ref(false),
      isServer: true,
      timeoutMs: AUTH_RESOLVE_TIMEOUT_MS,
    });
    expect(resolved.value).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is true at once when Clerk is already loaded and starts no timer", () => {
    const resolved = createAuthResolved({
      isLoaded: ref(true),
      isServer: false,
      timeoutMs: AUTH_RESOLVE_TIMEOUT_MS,
    });
    expect(resolved.value).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the scope that owns it stops", () => {
    const scope = effectScope();
    scope.run(() =>
      createAuthResolved({
        isLoaded: ref(false),
        isServer: false,
        timeoutMs: AUTH_RESOLVE_TIMEOUT_MS,
      }),
    );
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useAuthResolved", () => {
  it("is true at once on a deferred page, from the stand-in", async () => {
    stubNuxtApp(createDeferredClerk());
    const { useAuthResolved } =
      await import("../app/composables/useAuthResolved.ts");
    expect(useAuthResolved().value).toBe(true);
  });

  it("follows Clerk's loaded state on a page where Clerk is installed", async () => {
    const isLoaded = ref(false);
    clerk.useAuth.mockReturnValue({ ...clerk.auth, isLoaded });
    stubNuxtApp(null);
    const { useAuthResolved } =
      await import("../app/composables/useAuthResolved.ts");
    vi.useFakeTimers();
    try {
      const resolved = useAuthResolved();
      expect(resolved.value).toBe(false);
      isLoaded.value = true;
      expect(resolved.value).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useReverification", () => {
  async function setUp(
    open: (callbacks: {
      afterVerification: () => void;
      afterVerificationCancelled: () => void;
    }) => void,
  ) {
    const getToken = vi.fn(async () => "fresh");
    clerk.useAuth.mockReturnValue({
      ...clerk.auth,
      getToken: { value: getToken },
    });
    clerk.useClerk.mockReturnValue(
      computed(() => ({ __internal_openReverification: open })),
    );
    stubNuxtApp(null);
    const { useReverification } =
      await import("../app/composables/useReverification.ts");
    return { getToken, ...useReverification() };
  }

  const reverificationRequired = Object.assign(new Error("403"), {
    statusCode: 403,
    data: { data: { code: "reverification_required" } },
  });

  it("opens Clerk's prompt, refreshes the token, and runs the action again", async () => {
    const { withReverification, getToken } = await setUp((callbacks) =>
      callbacks.afterVerification(),
    );
    const action = vi
      .fn()
      .mockRejectedValueOnce(reverificationRequired)
      .mockResolvedValueOnce("deleted");
    expect(await withReverification(action)()).toBe("deleted");
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("rejects with ReverificationCancelledError when the prompt is cancelled", async () => {
    const { withReverification } = await setUp((callbacks) =>
      callbacks.afterVerificationCancelled(),
    );
    const action = vi.fn().mockRejectedValue(reverificationRequired);
    await expect(withReverification(action)()).rejects.toMatchObject({
      name: "ReverificationCancelledError",
    });
  });
});
