declare module "nuxt/schema" {
  interface RuntimeConfig {
    clerk: { secretKey: string; jwtKey: string; webhookSigningSecret: string };
    disableSignups: boolean;
    auth: { authorizedParties: string[] };
  }
  interface PublicRuntimeConfig {
    clerk: { publishableKey: string };
    auth: { deferredPaths: string[] };
  }
}

export {};
