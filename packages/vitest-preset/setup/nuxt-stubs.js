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

const nuxtAndNitroStubs = {
  defineNuxtRouteMiddleware: identity,
  defineEventHandler: identity,
  // Empty so code reading runtime config finds nothing. Tests that need values
  // stub their own with `vi.stubGlobal`.
  useRuntimeConfig: () => ({}),
  useHead: () => {},
  // h3's createError as a real Error carrying the status fields, so tests can
  // assert with `rejects.toMatchObject({ statusCode })`.
  /** @param {{ statusCode: number, statusMessage: string, data?: unknown }} input */
  createError: ({ statusCode, statusMessage, data }) =>
    Object.assign(new Error(statusMessage), { statusCode, data }),
};

Object.assign(globalThis, vueAutoImports, nuxtAndNitroStubs);
