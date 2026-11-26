import { describe, expect, it } from "vitest";
import {
  deletedUserProviderId,
  isClerkWebhookRequest,
} from "../shared/lib/webhook.ts";

describe("isClerkWebhookRequest", () => {
  it("is true for a POST to the route, with or without a query string", () => {
    expect(isClerkWebhookRequest("/api/webhooks/clerk", "POST")).toBe(true);
    expect(isClerkWebhookRequest("/api/webhooks/clerk?x=1", "post")).toBe(true);
    expect(isClerkWebhookRequest("/api/webhooks/clerk/", "POST")).toBe(true);
  });

  it.each([
    ["/api/webhooks/clerk", "GET"],
    ["/api/webhooks/clerk/extra", "POST"],
    ["/api/webhooks/other", "POST"],
    ["/api/webhooks", "POST"],
  ])("is false for %s %s", (path, method) => {
    expect(isClerkWebhookRequest(path, method)).toBe(false);
  });
});

describe("deletedUserProviderId", () => {
  it("reads the id of a deleted user", () => {
    expect(
      deletedUserProviderId({ type: "user.deleted", data: { id: "user_1" } }),
    ).toBe("user_1");
  });

  it.each([
    [{ type: "user.updated", data: { id: "user_1" } }],
    [{ type: "user.deleted", data: {} }],
    [{ type: "user.deleted", data: { id: "" } }],
    [{ type: "user.deleted", data: null }],
  ])("is null for %j", (payload) => {
    expect(deletedUserProviderId(payload)).toBeNull();
  });
});
