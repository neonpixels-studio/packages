# @neon-pixels/nuxt-auth

A Nuxt layer for Clerk authentication. `/api` requests are authenticated by a bearer session token, pages get Clerk's state for server rendering, and the first authenticated request creates the user row. On the client it installs Clerk (skipping it on public pages for signed-out visitors), attaches the session token to API requests, and provides the composables, route guard, and reverification prompt.

The layer never owns a database table. Each app keeps its own `users` table and tells the layer how to read and create a user. Its one option is the list of pages that may skip Clerk (`runtimeConfig.public.auth.deferredPaths`, below), and its one extension point is `defineAuthUsers()`.

The layer is consumed as source, not built. `main` points at `nuxt.config.ts`, and the package ships the config and the `server` and `shared` directories. There is no `dist`.

Not part of this package: the login, sign-up, and account pages, API keys (`@neon-pixels/api-keys`), end-to-end sign-in helpers (`@neon-pixels/playwright-preset/clerk`), and anything about who may use an app beyond "has a valid session" (owner lists, plans, invitations, rate limits). An app enforces those in its store or in its own middleware.

## Install

```sh
pnpm add @neon-pixels/nuxt-auth @clerk/nuxt @clerk/vue @clerk/backend
```

Peer dependencies: `nuxt` 4, `vue` 3, `@clerk/nuxt` 3, `@clerk/vue` 2, and `@clerk/backend` 3. The layer extends `@neon-pixels/nuxt-base`, which is installed with it, so an app lists only this layer:

```ts
export default defineNuxtConfig({
  extends: ["@neon-pixels/nuxt-auth"],
});
```

## Adopt it

1. Extend the layer (above) and remove `@neon-pixels/nuxt-base` from `extends`.
2. Delete what the layer now provides from your own config: the `@clerk/nuxt` entry in `modules`, `clerk.skipServerMiddleware`, and the `clerk`, `public.clerk`, and `disableSignups` runtime config keys.
3. Delete your own copies of the server files the layer replaces: the `/api` bearer middleware, the Clerk page middleware, the bearer token parser, the Clerk token verification helper, the get-or-create-user helper with its cache, and the reverification helper.
4. Allow any route a Nuxt module serves under `/api` (for example `/api/_nuxt_icon` from `@nuxt/icon`) in `isPublicApiPath`, because every `/api` request now needs a bearer token unless the store says otherwise.
5. Register your user store from a Nitro plugin (below).
6. Replace reads of your own `event.context.user` with `requireAuth(event)`.
7. Set the environment variables (below).
8. Delete what the client side now provides (see "Adopting the client side" below).

## Register the user store

The layer cannot import an app's schema, so the app registers its store once, from a Nitro plugin such as `server/plugins/auth-users.ts`. Calling `defineAuthUsers` twice throws. A request that needs the store before one is registered gets a 500 saying to call `defineAuthUsers` from a server plugin.

```ts
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { useDb } from "../utils/db";

export default defineNitroPlugin(() => {
  defineAuthUsers({
    async findByProviderId(providerId) {
      const [row] = await useDb()
        .select({ id: users.id, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.providerId, providerId))
        .limit(1);
      return row ? { id: row.id, deleted: row.deletedAt !== null } : null;
    },

    // Two first requests can arrive at once. The unique index on
    // `provider_id` decides which insert wins, and the loser reads the row.
    async create(providerId) {
      const db = useDb();
      const [created] = await db
        .insert(users)
        .values({ providerId })
        .onConflictDoNothing({ target: users.providerId })
        .returning({ id: users.id });
      if (created) {
        return created;
      }
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.providerId, providerId))
        .limit(1);
      if (!existing) {
        throw new Error("The user row disappeared after a conflict");
      }
      return existing;
    },
  });
});
```

| Function                                | Required | What it does                                                                                                                                                                             |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findByProviderId(providerId)`          | yes      | Resolves to `{ id: string, deleted: boolean }`, or `null` when there is no row.                                                                                                          |
| `create(providerId)`                    | yes      | Resolves to `{ id: string }`. Must be safe when two requests create the same user at once.                                                                                               |
| `authenticateOtherBearer(token, event)` | no       | For an app that accepts API keys or a shared secret on the same header. Resolves to `{ userId: string }` plus any fields the app wants on the context, or `null` for a token it rejects. |
| `isPublicApiPath(path, method)`         | no       | Returns `true` for an `/api` route that needs no authentication. `path` has no query string.                                                                                             |

## The Clerk webhook

The layer serves `POST /api/webhooks/clerk`. The API middleware treats that one method and path as public without the app listing it in `isPublicApiPath`; the signature is the authentication.

1. Create a webhook endpoint in the Clerk dashboard pointing at `https://<your site>/api/webhooks/clerk`, subscribe it to the events you want, and set its signing secret as `CLERK_WEBHOOK_SIGNING_SECRET`.
2. The route verifies the delivery with `verifyWebhook` from `@clerk/backend/webhooks` and `runtimeConfig.clerk.webhookSigningSecret`.
3. For a verified `user.deleted` event, the layer first calls `clearAuthUser` with the deleted user's Clerk id, and calls it again once the handlers finish, because a request with a still-valid token can cache the user again while a handler runs. Like `clearAuthUser` everywhere, this only clears the instance that received the delivery.
4. Every verified event, `user.deleted` included, is then passed to the Nitro hook `clerk:webhook` as `{ type, data }`. The layer decides nothing about your data; your handlers do.

| Response | When                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200      | The signature is valid and every handler finished, or there are none.                                                                                          |
| 400      | A signature header is missing, or the signature does not match the body.                                                                                       |
| 503      | The signing secret was empty at build time. Set it and redeploy; Clerk retries for a limited window, so deliveries sent before the redeploy can still be lost. |
| 500      | A handler threw. The error is reported to Sentry (`@sentry/nuxt`) and Clerk retries.                                                                           |

No response includes the secret, the signature, the request body, or a handler's error message.

Handle the events you care about from a server plugin. This one marks the app's user row deleted when Clerk deletes the user:

```ts
// server/plugins/clerk-webhook.ts
import { eq } from "drizzle-orm";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("clerk:webhook", async ({ type, data }) => {
    if (type !== "user.deleted" || !data.id) {
      return;
    }
    await db
      .update(users)
      .set({ deleted: true })
      .where(eq(users.providerId, data.id));
  });
});
```

The hook's payload is typed by the layer (`ClerkWebhookPayload`, narrowed by `type`), through an augmentation of `NitroRuntimeHooks` from `nitropack/types`.

**Upgrading an app that has its own route.** An app's own `server/api/webhooks/clerk.post.ts` takes priority over the layer's, so the layer's cache clearing and `clerk:webhook` dispatch never run, and the middleware now treats that path as public. Delete the app's route and move its logic into a `clerk:webhook` handler.

**Handlers must be safe to run twice.** Clerk retries any delivery that did not get a 200, and it can deliver an event more than once, so a handler that already ran for an event has to leave the same result when it runs again. The example above is safe because it sets a flag instead of toggling it. Every handler runs in the one request, so a slow or failing handler delays and fails the whole delivery: keep each one short, and move slow work to a queue.

## What the middleware does

`/api` and the paths under it are the API. Everything else is a page. The layer's two middleware files run before the app's own server middleware and route handlers.

**API requests** (`server/middleware/auth-api.ts`). It does nothing when `isPublicApiPath` returns `true`. Otherwise it reads the `Authorization: Bearer` header and never reads a cookie.

- No token: 401.
- A token shaped like a JWT (three dot-separated parts): `verifySessionToken`. A rejected token is a 401. Otherwise `resolveAuthUser`, and `event.context.auth` becomes the session context below.
- Any other token: the store's `authenticateOtherBearer`. Its result becomes `event.context.auth` with `method: "other"`; `null` is a 401. Without that function, it is a 401.

A 403, 500, or 503 from these steps passes through as it is and is never turned into a 401.

**Page requests** (`server/middleware/auth-pages.ts`). It runs `clerkMiddleware()` from `@clerk/nuxt/server`, so pages render with Clerk's state. It never runs for `/api`. The layer sets `clerk.skipServerMiddleware: true` because it registers this itself.

## The auth context

```ts
type AuthContext =
  | {
      userId: string; // the app's user id
      providerId: string; // the Clerk user id (the token's `sub`)
      method: "session";
      factorVerificationAges: [first: number, second: number] | null;
    }
  | { userId: string; method: "other"; [field: string]: unknown };
```

Read it in a handler with `requireAuth(event)`, which returns the context or throws a 401. `@clerk/nuxt` already declares `event.context.auth` as its own function type (used on page requests), so the layer cannot declare a second type for the same property. `requireAuth` is where a handler gets the context typed. The `AuthContext` type is exported from `@neon-pixels/nuxt-auth/build`.

## Server utilities

These are auto-imported in `server/`.

| Utility                             | What it does                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineAuthUsers(store)`            | Registers the user store (above).                                                                                                                                      |
| `requireAuth(event)`                | Returns the auth context, or throws a 401.                                                                                                                             |
| `readBearerToken(event)`            | The token of the `Authorization: Bearer` header, or `null`. It knows nothing about what kind of token it is, so an app's own API key or shared secret auth can use it. |
| `verifySessionToken(token)`         | Returns `{ providerId, factorVerificationAges }`, `null` for a rejected token, a 503 when verification could not be completed, or a 500 when the secret key is empty.  |
| `resolveAuthUser(providerId)`       | Returns the app's user id and creates the row when there is none. A deleted user gets a 403, and so does a missing user while sign-ups are disabled.                   |
| `clearAuthUser(providerId)`         | Removes one user from the cache. Call it from account deletion code and webhooks.                                                                                      |
| `assertRecentReverification(event)` | Throws a 403 unless the session was verified in the last 10 minutes (below).                                                                                           |

### Outages are not sign-outs

`verifySessionToken` returns `null` only for a credential that is not acceptable: expired, not yet active, bad signature, malformed, wrong authorized party, or an unknown key id. When verification fails for any other reason, such as Clerk's keys not loading, it throws a 503, so an outage never looks like a signed-out user. The set of rejected reasons is `REJECTED_CREDENTIAL_REASONS` in `@neon-pixels/nuxt-auth/build`.

### The user cache

`resolveAuthUser` keeps successful lookups in memory by provider id: at most 500 entries, the oldest evicted first, each expiring after 60 seconds. Deleted users and failures are never cached, and concurrent lookups for one provider id share one store call.

`clearAuthUser` only clears the current function instance. On a serverless host other instances keep their entry until it expires, so the 60-second expiry is what bounds how long a deleted or changed user can still be served from the cache.

### Reverification

`assertRecentReverification(event)` is for routes that need a fresh sign-in, such as deleting an account. The window is 10 minutes.

- A request authenticated with `method: "other"` is rejected.
- `factorVerificationAges` is `[first factor, second factor]` in minutes, with `-1` for a factor that was not used (Clerk's `fva` claim). When the second-factor age is not `-1`, it must be inside the window. Otherwise the first-factor age must be. A missing or malformed claim fails.
- Every failure is a 403 with `data.code` set to `"reverification_required"`. Import `REVERIFICATION_REQUIRED_CODE` from `@neon-pixels/nuxt-auth/build` to match on it.

## The client side

### Clerk loading and deferral

`@clerk/nuxt` installs a client plugin that loads Clerk on every page. The layer removes it and installs Clerk from its own plugin, which runs before every other plugin, so a public page can skip Clerk for a signed-out visitor. If the module's plugin cannot be found at build time, the build fails with a message naming the `@clerk/nuxt` version, so an upgrade never leaves two plugins running. The build also fails when your `@clerk/vue` is a different copy from the one `@clerk/nuxt` depends on, because two copies do not share Clerk's state; keep `@clerk/vue` on a version `@clerk/nuxt` accepts.

Set the pages that may skip Clerk in your own config. The list is exact paths, empty by default, and with an empty list Clerk loads on every page:

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    public: { auth: { deferredPaths: ["/", "/pricing", "/docs"] } },
  },
});
```

A page is deferred only when its path is in the list (a trailing slash is ignored) and the request carries no Clerk session cookie (`__session`, or `__client_uat` with a value other than `0`). The decision is a pure function of the path and the `Cookie` header, so the server and the first client render agree. `shouldDeferClerk(path, cookieHeader, deferredPaths)` is exported from `@neon-pixels/nuxt-auth/build`.

On a deferred page:

- Clerk is not loaded on the server or the client, and the page middleware does not run `clerkMiddleware()`.
- The composables below report a settled signed-out state: loaded, not signed in, no user.
- Navigating to any page that is not deferred is a full page load, so the destination starts with Clerk installed.
- Every other Clerk composable (`useSession`, `useOrganization`, `useSignIn`, and the rest) and every Clerk component (`<SignedIn>`, `<UserButton>`, `<SignIn>`) needs Clerk installed and throws there. Keep them out of a layout shared with a deferred page.

Do not list a page that shows signed-in content, or a page whose HTML is prerendered or cached across visitors (`routeRules` `prerender`, `swr`, or `isr`): the decision is made again in the browser from its own cookies, so cached HTML rendered for one kind of visitor would not match what another one needs. The layer also assumes `app.baseURL` is `/`. A visitor whose session cookie is missing or expired sees the deferred, signed-out version of a listed page.

### Composables

These are auto-imported. The layer removes the `useAuth`, `useUser`, and `useClerk` auto-imports that `@clerk/nuxt` adds, because they break on a deferred page; the build fails if it cannot find them. Import Clerk's own from `@clerk/vue` only where you know Clerk is installed.

| Composable            | What it returns                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useClerkAuth()`      | Clerk's `useAuth()` value, or the settled signed-out value on a deferred page.                                                                                                                             |
| `useClerkUser()`      | Clerk's `useUser()` value, or the settled signed-out value on a deferred page.                                                                                                                             |
| `useClerkInstance()`  | Clerk's `useClerk()` value, or a ref holding `null` on a deferred page.                                                                                                                                    |
| `useSignOut()`        | `{ signOutStatus, signOutError, signOut }`. `signOutStatus` is `"idle"`, `"signingOut"`, or `"error"`. A failed sign-out sets the error and never throws to the caller.                                    |
| `useAuthResolved()`   | A computed boolean: `true` once Clerk has loaded, or after 2 seconds when it has not, so a page never waits forever when the Clerk script is blocked. `true` at once on the server and on a deferred page. |
| `useAuthHeaders()`    | `{ buildAuthHeaders }`. `buildAuthHeaders({ skipCache })` resolves to `{ Authorization: "Bearer <token>" }`, or `{}` when there is no token. `skipCache: true` asks Clerk for a fresh token.               |
| `useReverification()` | `{ withReverification }` (below).                                                                                                                                                                          |

### Route middleware and the return path

The layer ships a named route middleware, `auth`. A signed-out visitor is sent to `/login?return_to=<path>` with `replace`. It does nothing while Clerk is still loading.

```ts
definePageMeta({ middleware: "auth" });
```

An app that protects every page writes a global middleware from the same helpers:

```ts
// app/middleware/auth.global.ts
export default defineNuxtRouteMiddleware((to) => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  if (isLoaded.value && !isSignedIn.value && to.path !== "/login") {
    return navigateTo(buildLoginPath(to.fullPath), { replace: true });
  }
});
```

`buildLoginPath(currentPath)` and `getSafeReturnPath(rawValue)` are auto-imported and exported from `@neon-pixels/nuxt-auth/build`, with the query parameter name as `RETURN_TO_QUERY_PARAM` (`"return_to"`). The name is deliberately not `redirect_url`, which Clerk reads itself.

`getSafeReturnPath` returns the path (with query and hash) only when the value is a string that starts with a single `/`, stays on the same origin when resolved, and does not lead back to `/login`. It returns `null` for everything else, including `//host`, `/\host`, an absolute URL, and a value with another scheme. Your login page uses it for the destination after sign-in:

```vue
<script setup lang="ts">
const route = useRoute();
const destination = computed(
  () => getSafeReturnPath(route.query.return_to) ?? "/",
);
</script>

<template>
  <SignIn :force-redirect-url="destination" />
</template>
```

Where an app sends a visitor after sign-in when there is no return path, and redirecting signed-in visitors away from public pages, stay in the app.

### The session token on API requests

On the client, every same-origin request to `/api` or a path under `/api/` carries `Authorization: Bearer <session token>` when the visitor is signed in. It holds for `$fetch`, `useFetch`, and plain `fetch`, because the plugin wraps `fetch` itself and ofetch reads it on every call.

- A request to any other origin never gets the header, and a request that already has an `Authorization` header is left alone.
- Getting the token is raced against a 10-second timeout (`SESSION_TOKEN_TIMEOUT_MS`). On timeout, on a deferred page, or when there is no session, the request goes out with no header.
- The token is read when each request is sent, so a request queued for later carries a fresh one.
- During server rendering no token is attached, so an `/api` call made while rendering is answered with 401. Pages that need user data on the server read it from Clerk state (`useClerkUser()`), not from the app's own API.

### Reverification prompt

`useReverification()` returns `{ withReverification }`. `withReverification(action)` returns a function that runs `action`. When it fails with a 403 whose `data.code` is `reverification_required` (the server side's `REVERIFICATION_REQUIRED_CODE`), it opens Clerk's reverification prompt, and once the visitor completes it, gets a fresh session token and runs the action once more.

```ts
const { withReverification } = useReverification();
const deleteAccount = withReverification(() =>
  $fetch("/api/account", { method: "DELETE" }),
);

try {
  await deleteAccount();
} catch (error) {
  if (error instanceof ReverificationCancelledError) {
    return;
  }
  throw error;
}
```

- Any other error, including a 403 with another code, is rethrown unchanged. A second reverification failure is rethrown and the prompt is not opened again.
- A cancelled prompt rejects with `ReverificationCancelledError`, which is auto-imported and exported from `@neon-pixels/nuxt-auth/build`.
- Clerk's Vue SDK has no public wrapper for the prompt, so the layer calls `__internal_openReverification`, the entry point Clerk's own React hook uses. It is called from one function (`app/internal/openReverificationPrompt.ts`), so a Clerk upgrade that renames it is a one-line change, and it fails with a clear error when the entry point is missing.

### Adopting the client side

An adopting app deletes its own copies of:

- the Clerk plugin (`plugins/clerk.ts`) and the build hook that removes `@clerk/nuxt`'s plugin,
- the deferral helpers and the deferred-path list (move the list to `runtimeConfig.public.auth.deferredPaths`),
- the wrapper composables around `useAuth`, `useUser`, and `useClerk`, and the build hook that removes their auto-imports,
- the sign-out, auth-resolved, and reverification composables,
- the `auth` route middleware and the login return-path helpers,
- the fetch plugin that attaches the session token (and any build hook that removes the `$fetch` auto-import for it), and
- the reverification helper that opens Clerk's prompt.

The layer does not report `sdkMetadata` to Clerk, which `@clerk/nuxt`'s own plugin sets.

## Environment variables

Values are read from `process.env` when the config loads, so they are fixed at build time. Netlify does not pass build-time variables to functions at run time. Nuxt also lets a `NUXT_`-prefixed variable override its runtime config key at run time on a host that passes it; `CLERK_WEBHOOK_SIGNING_SECRET`, `CONTEXT`, and `DEPLOY_PRIME_URL` are only read at build time.

| Variable                            | Runtime config                | What it is                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `public.clerk.publishableKey` | Clerk publishable key (Clerk dashboard, API keys). Empty by default.                                                                                                                                             |
| `NUXT_CLERK_SECRET_KEY`             | `clerk.secretKey`             | Clerk secret key (Clerk dashboard, API keys). An empty key does not fail the build, because some apps have none in preview builds; the first request to verify a token fails with a 500 that names the variable. |
| `NUXT_CLERK_JWT_KEY`                | `clerk.jwtKey`                | Clerk's JWKS public key (Clerk dashboard, API keys, "Show JWT public key"). Optional. When set, tokens are verified without a network request.                                                                   |
| `CLERK_WEBHOOK_SIGNING_SECRET`      | `clerk.webhookSigningSecret`  | Signing secret of a Clerk webhook endpoint (Clerk dashboard, Webhooks, the endpoint's signing secret). The webhook route verifies every delivery with it. Empty by default, which makes the route answer 503.    |
| `NUXT_DISABLE_SIGNUPS`              | `disableSignups`              | `"true"` stops the layer from creating users. Any other value leaves sign-ups open.                                                                                                                              |
| `NUXT_PUBLIC_SITE_URL`              | `auth.authorizedParties`      | The site's origin, from `@neon-pixels/nuxt-base`. A production build fails when it is unset. Its origin is passed to Clerk as an authorized party.                                                               |
| `CONTEXT`, `DEPLOY_PRIME_URL`       | `auth.authorizedParties`      | Set by Netlify. Outside the `production` context the origin of `DEPLOY_PRIME_URL` is added, so deploy previews can sign in.                                                                                      |

`runtimeConfig.auth.authorizedParties` is the list of origins without duplicates. When it is not empty, a token issued for another origin is rejected.

## Pure functions

`@neon-pixels/nuxt-auth/build` exports the functions behind the utilities, with nothing imported from Nuxt: `parseBearerToken`, `isApiPath`, `buildAuthRuntimeConfig`, `parseFactorVerificationAges`, `isRecentlyVerified`, `createUserCache`, `createUserResolver`, `shouldDeferClerk`, `buildLoginPath`, `getSafeReturnPath`, `createSessionTokenFetch`, `createWithReverification`, `ReverificationCancelledError`, and the constants above.
