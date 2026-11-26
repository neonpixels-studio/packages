import { describe, expect, it, vi } from "vitest";
import {
  createSaveQueue,
  type AppearanceSnapshot,
} from "../shared/lib/index.ts";

function deferred() {
  let finish: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

const snapshot = (accent: string): AppearanceSnapshot => ({
  theme: "dark",
  accent,
});

describe("the save queue", () => {
  it("collapses changes made during a save into one further call", async () => {
    const gates = [deferred(), deferred()];
    const saved: AppearanceSnapshot[] = [];
    const save = vi.fn(async (value: AppearanceSnapshot) => {
      saved.push(value);
      await gates[saved.length - 1]?.promise;
    });
    const queue = createSaveQueue(() => save);

    const done = queue.enqueue(snapshot("a"));
    void queue.enqueue(snapshot("b"));
    void queue.enqueue(snapshot("c"));
    expect(save).toHaveBeenCalledTimes(1);

    gates[0]?.finish();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    gates[1]?.finish();
    await done;
    expect(saved.map((value) => value.accent)).toEqual(["a", "c"]);
  });

  it("sends again after the queue went idle", async () => {
    const save = vi.fn(async () => undefined);
    const queue = createSaveQueue(() => save);
    await queue.enqueue(snapshot("a"));
    await queue.enqueue(snapshot("b"));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports a failed save and keeps going", async () => {
    const warn = vi.fn();
    const save = vi
      .fn<(value: AppearanceSnapshot) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const queue = createSaveQueue(() => save, warn);
    await expect(queue.enqueue(snapshot("a"))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    await queue.enqueue(snapshot("b"));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does nothing without an adapter", async () => {
    const queue = createSaveQueue(() => undefined);
    await expect(queue.enqueue(snapshot("a"))).resolves.toBeUndefined();
  });
});
