import { describe, expect, it } from "vitest";
import { createBrowserStorage } from "../src/index.ts";
import { createMemoryStorage } from "../src/testing.ts";
import type { ConsentStorage } from "../src/types.ts";

function refusingStorage(): ConsentStorage {
  const refuse = (): never => {
    throw new DOMException("blocked", "SecurityError");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

describe("createBrowserStorage", () => {
  it("reads and writes through to the real storage", () => {
    const real = createMemoryStorage();
    const storage = createBrowserStorage(() => real);
    storage.setItem("key", "value");
    expect(real.entries.get("key")).toBe("value");
    expect(storage.getItem("key")).toBe("value");
    storage.removeItem("key");
    expect(real.entries.has("key")).toBe(false);
  });

  it("does not call the resolver until storage is used", () => {
    let resolved = 0;
    const real = createMemoryStorage();
    const storage = createBrowserStorage(() => {
      resolved += 1;
      return real;
    });
    expect(resolved).toBe(0);
    storage.getItem("key");
    expect(resolved).toBe(1);
  });

  it("never throws when the resolver throws on access", () => {
    const storage = createBrowserStorage(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(storage.getItem("key")).toBeNull();
    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(storage.getItem("key")).toBe("value");
    expect(() => storage.removeItem("key")).not.toThrow();
    expect(storage.getItem("key")).toBeNull();
  });

  it("keeps a value in memory when setItem throws", () => {
    const storage = createBrowserStorage(refusingStorage);
    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(storage.getItem("key")).toBe("value");
  });

  it("persists again once a later write succeeds", () => {
    const real = createMemoryStorage();
    let blocked = true;
    const storage = createBrowserStorage(() =>
      blocked ? refusingStorage() : real,
    );
    storage.setItem("key", "first");
    expect(real.entries.has("key")).toBe(false);
    blocked = false;
    storage.setItem("key", "second");
    expect(real.entries.get("key")).toBe("second");
    // The stale in-memory copy must not shadow the stored value.
    real.setItem("key", "third");
    expect(storage.getItem("key")).toBe("third");
  });

  it("removes a value held in memory", () => {
    const storage = createBrowserStorage(refusingStorage);
    storage.setItem("key", "value");
    storage.removeItem("key");
    expect(storage.getItem("key")).toBeNull();
  });

  it("keeps other stored values on removeItem after a refused write", () => {
    const real = createMemoryStorage({ legacy: "accepted" });
    let blocked = true;
    const storage = createBrowserStorage(() =>
      blocked ? refusingStorage() : real,
    );
    storage.setItem("current", "granted");
    blocked = false;
    storage.removeItem("legacy");
    expect(real.entries.get("legacy")).toBe("accepted");
  });

  it("removes other stored values again once memory is empty", () => {
    const real = createMemoryStorage({ legacy: "accepted" });
    let blocked = true;
    const storage = createBrowserStorage(() =>
      blocked ? refusingStorage() : real,
    );
    storage.setItem("current", "granted");
    blocked = false;
    storage.setItem("current", "granted");
    storage.removeItem("legacy");
    expect(real.entries.has("legacy")).toBe(false);
  });

  it("clears an older stored choice when the new write is refused", () => {
    const real = createMemoryStorage({ key: "granted" });
    const storage = createBrowserStorage(() => ({
      getItem: real.getItem,
      removeItem: real.removeItem,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    }));
    storage.setItem("key", "denied");
    expect(storage.getItem("key")).toBe("denied");
    expect(real.entries.has("key")).toBe(false);
  });

  it("still reports the new choice when deletes are refused too", () => {
    const storage = createBrowserStorage(() => ({
      getItem: () => "granted",
      removeItem: refusingStorage().removeItem,
      setItem: refusingStorage().setItem,
    }));
    storage.setItem("key", "denied");
    expect(storage.getItem("key")).toBe("denied");
  });
});
