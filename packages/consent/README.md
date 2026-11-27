# @neon-pixels/consent

Analytics consent for the browser, with no framework and no runtime dependency. It keeps one choice for 180 days, treats a browser privacy signal as a refusal, and loads Google Analytics only when you ask it to. Banners stay in your app.

Importing the package touches no browser global, so it is safe during server rendering. Every browser object (`storage`, `navigator`, `window`, `document`) is passed in.

## Install

```sh
pnpm add @neon-pixels/consent
```

## Usage

```ts
import {
  createBrowserStorage,
  createConsent,
  loadGoogleAnalytics,
} from "@neon-pixels/consent";

const consent = createConsent({
  app: "my-site", // stored under "my-site:analytics-consent"
  services: { analytics: { measurementId: "G-XXXXXXX" }, sessionReplay: true },
  storage: createBrowserStorage(() => window.localStorage),
  navigator,
  window,
  // legacyKey: "old-key", // migrate an older key, if the app had one
});

consent.status; // "granted" | "denied" | "unset" | "signal"
consent.shouldPrompt; // show your banner
consent.hadGrant; // true after any earlier grant, even an expired one
consent.services; // ["analytics", "sessionReplay"]: name only these in the banner

if (consent.status === "granted") {
  loadGoogleAnalytics("G-XXXXXXX", { document, window });
}

consent.grant(); // then call loadGoogleAnalytics
consent.deny();
consent.clearCookies(); // expire _ga cookies without recording a choice
```

If a privacy signal appears after an earlier grant, or a grant has expired, `hadGrant` is still true: call `clearCookies()` to remove the old `_ga` cookies without recording a denial. `status` and `shouldPrompt` read storage each time, so they are always current.

### Status

- `granted` / `denied`: a valid stored choice.
- `unset`: nothing stored, or the record is expired, malformed, or dated more than 180 days ahead.
- `signal`: Global Privacy Control, or Do Not Track set to `1` or `yes` on `navigator`, `window`, or `navigator.msDoNotTrack`. Nothing should load, `shouldPrompt` is false, and `grant()` does nothing.

`shouldPrompt` is also false when no service is configured.

### Stored record

`{ "choice": "granted" | "denied", "expiresAt": <epoch ms> }` under `<app>:analytics-consent`, expiring 180 days after the choice. The older values `accepted` and `declined` (inside a record, as a bare string, or under `legacyKey`) are read and rewritten in the current form. A bare legacy value starts a fresh 180 days.

### `hadGrant`

True when the stored value recorded a grant, including an expired grant and a grant hidden by a privacy signal. False when nothing is stored or the stored choice was a denial. Read it to decide whether old `_ga` cookies may exist.

### `clearCookies()`

Expires the `_ga` and `_ga_*` cookies on the host and each parent domain. It never writes to storage and never throws (cookie access can fail on an opaque origin).

### `deny()`

Stores the denial and sets `ga-disable-<measurementId>` for the page. When an earlier grant existed (current, expired, or made on this page), it also expires the `_ga` and `_ga_*` cookies on the host and each parent domain. IP addresses get no parent domains.

### `loadGoogleAnalytics(measurementId, { document, window })`

Injects gtag.js once per window however often it is called, with Google signals and ad personalization turned off. It sends no Consent Mode commands: call it only after a grant. It defines no `window.gtag`: push to `window.dataLayer` yourself to send events. A second measurement id on the same window is configured without a second tag. Calling it again after `deny()` clears the disable flag without adding a second tag.

### `createBrowserStorage(resolveStorage)`

Wraps storage so a blocked browser never breaks consent: Safari with all cookies blocked throws on reading `window.localStorage` itself, so the resolver runs on each call, and a refused write is kept in memory for the page (the choice still applies, it just does not persist). While a refused write is held in memory, `removeItem` leaves other keys in storage alone, so a legacy key is not deleted before its replacement has persisted. It never throws.

### `hasPrivacySignal({ navigator, window })`

The signal check on its own.

## Testing

```ts
import {
  createMemoryStorage,
  stubPrivacySignal,
} from "@neon-pixels/consent/testing";

const storage = createMemoryStorage();
const navigator = stubPrivacySignal({ globalPrivacyControl: true });
```

`stubPrivacySignal` returns a `navigator` stand-in with `doNotTrack` and `globalPrivacyControl`. `createMemoryStorage` is an in-memory storage with an `entries` map for assertions.
