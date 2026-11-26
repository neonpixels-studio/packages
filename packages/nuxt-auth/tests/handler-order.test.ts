import { describe, expect, it } from "vitest";
import { moveHandlersToFront } from "../shared/lib/handler-order.ts";

describe("moveHandlersToFront", () => {
  const handlers = [
    { handler: "/app/server/middleware/a.ts" },
    { handler: "/layer/server/middleware/auth-api.ts" },
    { handler: "/app/server/api/me.get.ts" },
    { handler: "/layer/server/middleware/auth-pages.ts" },
    { handler: () => {} },
  ];
  const isLayer = (path: string) => path.startsWith("/layer/");

  it("moves the matches to the front in their original order", () => {
    expect(
      moveHandlersToFront(handlers, isLayer).map((entry) => entry.handler),
    ).toEqual([
      "/layer/server/middleware/auth-api.ts",
      "/layer/server/middleware/auth-pages.ts",
      "/app/server/middleware/a.ts",
      "/app/server/api/me.get.ts",
      handlers[4]?.handler,
    ]);
  });

  it("keeps everything when nothing matches", () => {
    expect(moveHandlersToFront(handlers, () => false)).toEqual(handlers);
  });

  it("does not change the list it was given", () => {
    const before = [...handlers];
    moveHandlersToFront(handlers, isLayer);
    expect(handlers).toEqual(before);
  });
});
