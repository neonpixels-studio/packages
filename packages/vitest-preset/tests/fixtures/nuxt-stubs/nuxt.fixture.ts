import { expect, it } from "vitest";

declare const ref: typeof import("vue").ref;
declare const computed: typeof import("vue").computed;
declare const defineEventHandler: <T>(handler: T) => T;
declare const defineNuxtRouteMiddleware: <T>(handler: T) => T;
declare const useHead: () => unknown;
declare const useRuntimeConfig: () => Record<string, unknown>;
declare const createError: (
  input:
    | string
    | {
        statusCode?: number;
        statusMessage?: string;
        message?: string;
        data?: unknown;
      },
) => Error & { statusCode?: number; statusMessage?: string; data?: unknown };

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
  expect(useRuntimeConfig()).toEqual({ public: {} });
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
    statusMessage: "Not found",
    statusCode: 404,
    data: { id: 1 },
  });
});

it("accepts a message string or a message option like h3", () => {
  expect(createError("Boom")).toMatchObject({
    message: "Boom",
    statusCode: 500,
  });
  expect(createError({ statusCode: 400, message: "Bad" })).toMatchObject({
    message: "Bad",
    statusCode: 400,
  });
});

it("lets the consumer's setup file override a stub", () => {
  expect(useHead()).toBe("overridden");
});
