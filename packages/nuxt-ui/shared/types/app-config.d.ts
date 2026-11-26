import type { ConsentConfigInput } from "../lib/consent-config.ts";
import type { AppearanceConfigInput } from "../lib/types.ts";

declare module "nuxt/schema" {
  interface AppConfigInput {
    appearance?: AppearanceConfigInput;
    consent?: ConsentConfigInput;
  }
}

export {};
