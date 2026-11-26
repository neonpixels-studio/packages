import { clerkPlugin } from "@clerk/vue";
import { setErrorThrowerOptions } from "@clerk/vue/internal";
import {
  isDeferredPath,
  shouldDeferClerk,
} from "../../shared/lib/clerk-deferral.ts";
import {
  createDeferredClerk,
  type DeferredClerk,
} from "../internal/deferredClerk.ts";

setErrorThrowerOptions({ packageName: "@clerk/nuxt" });

const RELOAD_MIDDLEWARE_NAME = "neon-pixels-auth-deferral-reload";

type ClerkRuntimeConfig = Record<string, unknown>;
type NuxtAppWithSsr = {
  vueApp: { use: (plugin: unknown, options: unknown) => void };
  ssrContext?: { event: { context: Record<string, unknown> } };
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
// signed-out stand-ins. The absolute URL keeps a "//host" path on the site.
function reloadWhenLeavingDeferredPages(deferredPaths: string[]): void {
  addRouteMiddleware(
    RELOAD_MIDDLEWARE_NAME,
    (to) => {
      if (isDeferredPath(to.path, deferredPaths)) {
        return;
      }
      return navigateTo(`${window.location.origin}${to.fullPath}`, {
        external: true,
      });
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

// Installs Clerk the way @clerk/nuxt's own plugin does, including the server's
// initial state, so signed-in visitors are server-rendered as signed in.
function installClerk(nuxtApp: NuxtAppWithSsr): null {
  const initialState = useState<unknown>(
    "clerk-initial-state",
    () => undefined,
  );
  const keylessContext = useState<
    { claimUrl: string; apiKeysUrl: string } | undefined
  >("clerk-keyless-context", () => undefined);
  // ssrContext only exists during SSR; the client reads the serialized state.
  if (nuxtApp.ssrContext) {
    const { context } = nuxtApp.ssrContext.event;
    initialState.value = context.__clerk_initial_state;
    keylessContext.value = context.__clerk_keyless as
      { claimUrl: string; apiKeysUrl: string } | undefined;
  }
  const clerkConfig = (useRuntimeConfig().public.clerk ??
    {}) as ClerkRuntimeConfig;
  nuxtApp.vueApp.use(clerkPlugin, {
    ...clerkConfig,
    __internal_clerkJSUrl: clerkConfig.jsUrl,
    __internal_clerkUIUrl: clerkConfig.uiUrl,
    __internal_clerkJSVersion: clerkConfig.clerkJSVersion,
    __internal_clerkUIVersion: clerkConfig.clerkUIVersion,
    routerPush: (to: string) => navigateTo(to),
    routerReplace: (to: string) => navigateTo(to, { replace: true }),
    initialState: initialState.value,
    ...(keylessContext.value
      ? {
          __internal_keyless_claimKeylessApplicationUrl:
            keylessContext.value.claimUrl,
          __internal_keyless_copyInstanceKeysUrl:
            keylessContext.value.apiKeysUrl,
        }
      : {}),
  });
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
