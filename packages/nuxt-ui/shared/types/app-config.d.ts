import type { AppearanceConfigInput } from "../lib/types.ts";

declare module "nuxt/schema" {
  interface AppConfigInput {
    appearance?: AppearanceConfigInput;
  }
}

export {};
