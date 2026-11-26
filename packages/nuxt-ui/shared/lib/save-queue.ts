import type { AppearanceSnapshot } from "./types.ts";

export interface SaveQueue {
  enqueue: (snapshot: AppearanceSnapshot) => Promise<void>;
}

type Sender = (snapshot: AppearanceSnapshot) => Promise<void>;

// While one save runs, later changes collapse into one further call carrying
// only the newest values. A failed save is reported and never rejects.
export function createSaveQueue(
  getSender: () => Sender | undefined,
  warn: (message: string, error: unknown) => void = console.warn,
): SaveQueue {
  let running: Promise<void> | undefined;
  let pending: AppearanceSnapshot | undefined;

  async function sendOnce(snapshot: AppearanceSnapshot): Promise<void> {
    try {
      await getSender()?.(snapshot);
    } catch (error) {
      warn("Could not save appearance to the account.", error);
    }
  }

  async function drain(): Promise<void> {
    while (pending) {
      const next = pending;
      pending = undefined;
      await sendOnce(next);
    }
    running = undefined;
  }

  function enqueue(snapshot: AppearanceSnapshot): Promise<void> {
    pending = snapshot;
    running ??= drain();
    return running;
  }

  return { enqueue };
}
