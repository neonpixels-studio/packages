# @neon-pixels/consent

Analytics consent for the browser, with no framework and no runtime dependency. It keeps one choice for 180 days, treats a browser privacy signal as a refusal, and loads Google Analytics only when you ask it to. Banners stay in your app.

Importing the package touches no browser global, so it is safe during server rendering. Every browser object (`storage`, `navigator`, `window`, `document`) is passed in.

## Install

```sh
pnpm add @neon-pixels/consent
```

## Usage

```ts
import { createConsent, loadGoogleAnalytics } from "@neon-pixels/consent";

const consent = createConsent({
  app: "my-site", // stored under "my-site:analytics-consent"
  services: { analytics: { measurementId: "G-XXXXXXX" }, sessionReplay: true },
  storage: window.localStorage,
  navigator,
  window,
  // legacyKey: "old-key", // migrate an older key, if the app had one
});

consent.status; // "granted" | "denied" | "unset" | "signal"
consent.shouldPrompt; // show your banner
consent.services; // ["analytics", "sessionReplay"]: name only these in the banner

if (consent.status === "granted") {
  loadGoogleAnalytics("G-XXXXXXX", { document, window });
}

consent.grant(); // then call loadGoogleAnalytics
consent.deny();
```

If a privacy signal appears after an earlier grant, `status` becomes `signal`; call `deny()` to clear the old `_ga` cookies. `status` and `shouldPrompt` read storage each time, so they are always current.

### Status

- `granted` / `denied`: a valid stored choice.
- `unset`: nothing stored, or the record is expired, malformed, or dated more than 180 days ahead.
- `signal`: Global Privacy Control, or Do Not Track set to `1` or `yes` on `navigator`, `window`, or `navigator.msDoNotTrack`. Nothing should load, `shouldPrompt` is false, and `grant()` does nothing.

`shouldPrompt` is also false when no service is configured.

### Stored record

`{ "choice": "granted" | "denied", "expiresAt": <epoch ms> }` under `<app>:analytics-consent`, expiring 180 days after the choice. The older values `accepted` and `declined` (inside a record, as a bare string, or under `legacyKey`) are read and rewritten in the current form. A bare legacy value starts a fresh 180 days.

### `deny()`

Stores the denial and sets `ga-disable-<measurementId>` for the page. When an earlier grant existed (current, expired, or made on this page), it also expires the `_ga` and `_ga_*` cookies on the host and each parent domain. IP addresses get no parent domains.

### `loadGoogleAnalytics(measurementId, { document, window })`

Injects gtag.js once per window however often it is called, with Google signals and ad personalization turned off. It sends no Consent Mode commands: call it only after a grant. It defines no `window.gtag`: push to `window.dataLayer` yourself to send events. A second measurement id on the same window is configured without a second tag. Calling it again after `deny()` clears the disable flag without adding a second tag.

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
