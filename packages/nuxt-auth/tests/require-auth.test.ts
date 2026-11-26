import { afterEach, describe, expect, it, vi } from "vitest";
import { stubNitro } from "./stubs.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

type TestEvent = { context: Record<string, unknown> };

async function load() {
  stubNitro();
  const { requireAuth } = await import("../server/utils/requireAuth.ts");
  const { assertRecentReverification } =
    await import("../server/utils/assertRecentReverification.ts");
  return { requireAuth, assertRecentReverification };
}

const sessionAuth = (ages: [number, number] | null) => ({
  userId: "u1",
  providerId: "user_1",
  method: "session",
  factorVerificationAges: ages,
});

function eventWith(auth: unknown): never {
  return { context: { auth } } as TestEvent as never;
}

describe("requireAuth", () => {
  it("returns the context the middleware stored", async () => {
    const { requireAuth } = await load();
    const auth = sessionAuth(null);
    expect(requireAuth(eventWith(auth))).toBe(auth);
  });

  it.each([undefined, null, () => ({}), { userId: undefined }, { userId: "" }])(
    "answers 401 for %s",
    async (auth) => {
      const { requireAuth } = await load();
      expect(() => requireAuth(eventWith(auth))).toThrow(
        expect.objectContaining({ statusCode: 401 }),
      );
    },
  );
});

describe("assertRecentReverification", () => {
  it("passes for a recent session", async () => {
    const { assertRecentReverification } = await load();
    expect(() =>
      assertRecentReverification(eventWith(sessionAuth([2, -1]))),
    ).not.toThrow();
  });

  it.each([
    ["a stale session", sessionAuth([30, -1])],
    ["a session without the claim", sessionAuth(null)],
    ["a stale second factor", sessionAuth([1, 30])],
    ["an other-bearer request", { userId: "u1", method: "other" }],
  ])("answers 403 with the code for %s", async (_name, auth) => {
    const { assertRecentReverification } = await load();
    expect(() => assertRecentReverification(eventWith(auth))).toThrow(
      expect.objectContaining({
        statusCode: 403,
        data: { code: "reverification_required" },
      }),
    );
  });

  it("answers 401 without an authenticated context", async () => {
    const { assertRecentReverification } = await load();
    expect(() => assertRecentReverification(eventWith(undefined))).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});
