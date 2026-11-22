import { expect, it } from "vitest";

declare const ref: typeof import("vue").ref;
declare const computed: typeof import("vue").computed;
declare const defineEventHandler: <T>(handler: T) => T;
declare const defineNuxtRouteMiddleware: <T>(handler: T) => T;
declare const useRuntimeConfig: () => Record<string, unknown>;
declare const createError: (input: {
  statusCode: number;
  statusMessage: string;
  data?: unknown;
}) => Error & { statusCode: number; data?: unknown };

it("provides Vue auto-imports without importing them", () => {
  const count = ref(2);
  const double = computed(() => count.value * 2);
  count.value = 5;
  expect(double.value).toBe(10);
});

it("returns the inner function from handler wrappers", () => {
  const handler = () => "ok";
  expect(defineEventHandler(handler)).toBe(handler);
  expect(defineNuxtRouteMiddleware(handler)).toBe(handler);
});

it("returns an empty runtime config", () => {
  expect(useRuntimeConfig()).toEqual({});
});

it("creates errors that carry the status fields", () => {
  const error = createError({
    statusCode: 404,
    statusMessage: "Not found",
    data: { id: 1 },
  });
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    message: "Not found",
    statusCode: 404,
    data: { id: 1 },
  });
});
