export interface ConsentStorageState {
  cookies: [];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
}

export interface ConsentDeclinedStorageStateOptions {
  /** The `app` name the app passes to `createConsent`. It names the storage key. */
  app: string;
  /** Origin of the app under test, such as `http://localhost:3000`. */
  origin: string;
  /** Epoch milliseconds the choice is made at. Defaults to the current time. */
  now?: number;
}

export declare function consentDeclinedStorageState(
  options: ConsentDeclinedStorageStateOptions,
): ConsentStorageState;

export declare function consentUnsetStorageState(): ConsentStorageState;
