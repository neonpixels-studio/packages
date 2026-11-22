import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  onUnmounted,
  reactive,
  ref,
  useAttrs,
  useSlots,
  watch,
  watchEffect,
} from "vue";

// Nuxt auto-imports Vue's API, so source files use these without importing
// them. Listed by name: copying every Vue export would also overwrite
// `Comment` and `Text` (see dom-globals.js).
const vueAutoImports = {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  onUnmounted,
  reactive,
  ref,
  useAttrs,
  useSlots,
  watch,
  watchEffect,
};

// Handler wrappers are identity functions so the module under test exports the
// inner function, which a test can call directly.
/** @param {unknown} handler */
const identity = (handler) => handler;

// h3 reports 500 when no status code is given.
const DEFAULT_STATUS_CODE = 500;

/**
 * h3's createError as a real Error carrying the status fields, so tests can
 * assert with `rejects.toMatchObject({ statusCode })`. Takes a message string
 * or an options object, like h3.
 * @param {string | { statusCode?: number, statusMessage?: string, message?: string, data?: unknown }} input
 */
function createError(input) {
  const options = typeof input === "string" ? { message: input } : input;
  const { statusCode, statusMessage, message, data } = options;
  return Object.assign(new Error(message ?? statusMessage), {
    statusCode: statusCode ?? DEFAULT_STATUS_CODE,
    statusMessage,
    data,
  });
}

const nuxtAndNitroStubs = {
  defineNuxtRouteMiddleware: identity,
  defineEventHandler: identity,
  // Empty so code reading runtime config finds nothing. Tests that need values
  // stub their own with `vi.stubGlobal`.
  useRuntimeConfig: () => ({ public: {} }),
  useHead: () => {},
  createError,
};

Object.assign(globalThis, vueAutoImports, nuxtAndNitroStubs);
