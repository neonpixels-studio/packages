import { clerkPlugin } from "@clerk/vue";
import { setErrorThrowerOptions } from "@clerk/vue/internal";
import {
  reloadTargetFor,
  shouldDeferClerk,
} from "../../shared/lib/clerk-deferral.ts";
import {
  createDeferredClerk,
  type DeferredClerk,
} from "../internal/deferredClerk.ts";

setErrorThrowerOptions({ packageName: "@clerk/nuxt" });

const RELOAD_MIDDLEWARE_NAME = "neon-pixels-auth-deferral-reload";

type ClerkRuntimeConfig = Record<string, unknown>;
type KeylessContext = { claimUrl: string; apiKeysUrl: string };
type ServerContext = Record<string, unknown>;
type NuxtAppWithSsr = {
  vueApp: { use: (plugin: unknown, options: unknown) => void };
  ssrContext?: { event: { context: ServerContext } };
};

function currentPath(): string {
  return import.meta.server
    ? useRequestURL().pathname
    : window.location.pathname;
}

function currentCookieHeader(): string {
  return import.meta.server
    ? (useRequestHeaders(["cookie"]).cookie ?? "")
    : document.cookie;
}

// Clerk is not installed in this document, so any page that may need it gets
// a fresh document load, which installs Clerk on boot. Global middleware runs
// before page middleware, so a target page's own middleware never sees the
// signed-out stand-ins.
function reloadWhenLeavingDeferredPages(deferredPaths: string[]): void {
  addRouteMiddleware(
    RELOAD_MIDDLEWARE_NAME,
    (to) => {
      const target = reloadTargetFor(to, window.location.origin, deferredPaths);
      if (target === null) {
        return;
      }
      return navigateTo(target, { external: true });
    },
    { global: true },
  );
}

function startDeferredClerk(deferredPaths: string[]): DeferredClerk {
  // Navigation guards only matter in the browser; SSR renders one request.
  if (!import.meta.server) {
    reloadWhenLeavingDeferredPages(deferredPaths);
  }
  return createDeferredClerk();
}

// The server's Clerk state reaches the client through the serialized payload;
// ssrContext only exists during SSR.
function readServerClerkState(nuxtApp: NuxtAppWithSsr) {
  const initialState = useState<unknown>(
    "clerk-initial-state",
    () => undefined,
  );
  const keylessContext = useState<KeylessContext | undefined>(
    "clerk-keyless-context",
    () => undefined,
  );
  if (nuxtApp.ssrContext) {
    const { context } = nuxtApp.ssrContext.event;
    initialState.value = context.__clerk_initial_state;
    keylessContext.value = context.__clerk_keyless as
      KeylessContext | undefined;
  }
  return {
    initialState: initialState.value,
    keylessContext: keylessContext.value,
  };
}

function buildClerkOptions(
  clerkConfig: ClerkRuntimeConfig,
  state: ReturnType<typeof readServerClerkState>,
) {
  return {
    ...clerkConfig,
    __internal_clerkJSUrl: clerkConfig.jsUrl,
    __internal_clerkUIUrl: clerkConfig.uiUrl,
    __internal_clerkJSVersion: clerkConfig.clerkJSVersion,
    __internal_clerkUIVersion: clerkConfig.clerkUIVersion,
    routerPush: (to: string) => navigateTo(to),
    routerReplace: (to: string) => navigateTo(to, { replace: true }),
    initialState: state.initialState,
    ...(state.keylessContext
      ? {
          __internal_keyless_claimKeylessApplicationUrl:
            state.keylessContext.claimUrl,
          __internal_keyless_copyInstanceKeysUrl:
            state.keylessContext.apiKeysUrl,
        }
      : {}),
  };
}

// Installs Clerk the way @clerk/nuxt's own plugin does, including the server's
// initial state, so signed-in visitors are server-rendered as signed in.
function installClerk(nuxtApp: NuxtAppWithSsr): null {
  const clerkConfig = (useRuntimeConfig().public.clerk ??
    {}) as ClerkRuntimeConfig;
  nuxtApp.vueApp.use(
    clerkPlugin,
    buildClerkOptions(clerkConfig, readServerClerkState(nuxtApp)),
  );
  return null;
}

export default defineNuxtPlugin({
  name: "neon-pixels-auth-clerk",
  enforce: "pre",
  setup(nuxtApp) {
    const { deferredPaths } = useRuntimeConfig().public.auth;
    const deferred = shouldDeferClerk(
      currentPath(),
      currentCookieHeader(),
      deferredPaths,
    );
    const clerkDeferral = deferred
      ? startDeferredClerk(deferredPaths)
      : installClerk(nuxtApp as unknown as NuxtAppWithSsr);
    return { provide: { clerkDeferral } };
  },
});
