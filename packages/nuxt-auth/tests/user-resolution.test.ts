import { describe, expect, it, vi } from "vitest";
import { createAuthStoreRegistry } from "../shared/lib/auth-store.ts";
import { createUserResolver } from "../shared/lib/user-resolution.ts";

function setup(
  options: {
    signupDisabled?: boolean;
    existing?: { id: string; deleted: boolean } | null;
  } = {},
) {
  const store = {
    findByProviderId: vi.fn(async () => options.existing ?? null),
    create: vi.fn(async (providerId: string) => ({ id: `new_${providerId}` })),
  };
  const resolver = createUserResolver({
    getStore: () => store,
    isSignupDisabled: () => options.signupDisabled ?? false,
  });
  return { store, resolver };
}

describe("createUserResolver", () => {
  it("returns an existing user without creating one", async () => {
    const { store, resolver } = setup({
      existing: { id: "u1", deleted: false },
    });
    expect(await resolver.resolve("user_1")).toBe("u1");
    expect(store.create).not.toHaveBeenCalled();
  });

  it("creates the user when there is none", async () => {
    const { store, resolver } = setup();
    expect(await resolver.resolve("user_1")).toBe("new_user_1");
    expect(store.create).toHaveBeenCalledWith("user_1");
  });

  it("serves the second lookup from the cache", async () => {
    const { store, resolver } = setup();
    await resolver.resolve("user_1");
    await resolver.resolve("user_1");
    expect(store.findByProviderId).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("shares one store call between concurrent lookups", async () => {
    const { store, resolver } = setup();
    await Promise.all([resolver.resolve("user_1"), resolver.resolve("user_1")]);
    expect(store.findByProviderId).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("answers 403 for a deleted user and does not cache it", async () => {
    const { store, resolver } = setup({
      existing: { id: "u1", deleted: true },
    });
    await expect(resolver.resolve("user_1")).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(resolver.resolve("user_1")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(store.findByProviderId).toHaveBeenCalledTimes(2);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("answers 403 without creating when sign-ups are disabled", async () => {
    const { store, resolver } = setup({ signupDisabled: true });
    await expect(resolver.resolve("user_1")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(store.create).not.toHaveBeenCalled();
  });

  it("still returns an existing user when sign-ups are disabled", async () => {
    const { resolver } = setup({
      signupDisabled: true,
      existing: { id: "u1", deleted: false },
    });
    expect(await resolver.resolve("user_1")).toBe("u1");
  });

  it("does not cache a failed create", async () => {
    const { store, resolver } = setup();
    store.create.mockRejectedValueOnce(new Error("db down"));
    await expect(resolver.resolve("user_1")).rejects.toThrow("db down");
    expect(await resolver.resolve("user_1")).toBe("new_user_1");
  });

  it.each([undefined, "", 7])(
    "answers 500 and caches nothing when the store returns the id %j",
    async (id) => {
      const { store, resolver } = setup();
      store.create.mockResolvedValueOnce({ id: id as never });
      await expect(resolver.resolve("user_1")).rejects.toMatchObject({
        statusCode: 500,
      });
      expect(await resolver.resolve("user_1")).toBe("new_user_1");
    },
  );

  it("looks the user up again after clear", async () => {
    const { store, resolver } = setup({
      existing: { id: "u1", deleted: false },
    });
    await resolver.resolve("user_1");
    resolver.clear("user_1");
    await resolver.resolve("user_1");
    expect(store.findByProviderId).toHaveBeenCalledTimes(2);
  });
});

describe("createAuthStoreRegistry", () => {
  const store = {
    findByProviderId: async () => null,
    create: async () => ({ id: "x" }),
  };

  it("returns the registered store", () => {
    const registry = createAuthStoreRegistry<unknown>();
    registry.define(store);
    expect(registry.require()).toBe(store);
  });

  it("throws when defined twice", () => {
    const registry = createAuthStoreRegistry<unknown>();
    registry.define(store);
    expect(() => registry.define(store)).toThrow("already called");
  });

  it("answers 500 naming defineAuthUsers when nothing is registered", () => {
    const registry = createAuthStoreRegistry<unknown>();
    expect(() => registry.require()).toThrow(
      expect.objectContaining({
        statusCode: 500,
        statusMessage: expect.stringContaining("defineAuthUsers"),
      }),
    );
  });
});
