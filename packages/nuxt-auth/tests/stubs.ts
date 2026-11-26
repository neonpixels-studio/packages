import { vi } from "vitest";

export type StubConfig = {
  secretKey?: string;
  jwtKey?: string;
  authorizedParties?: string[];
  disableSignups?: boolean;
};

/** Stands in for the Nitro auto-imports the layer's server files use. */
export function stubNitro(config: StubConfig = {}): void {
  vi.stubGlobal("useRuntimeConfig", () => ({
    clerk: {
      secretKey: config.secretKey ?? "sk_test_value",
      jwtKey: config.jwtKey ?? "",
      webhookSigningSecret: "",
    },
    disableSignups: config.disableSignups ?? false,
    auth: { authorizedParties: config.authorizedParties ?? [] },
  }));
  vi.stubGlobal(
    "createError",
    (input: { statusCode: number; statusMessage: string; data?: unknown }) =>
      Object.assign(new Error(input.statusMessage), input),
  );
  vi.stubGlobal(
    "getHeader",
    (event: { headers: Record<string, string> }, name: string) =>
      event.headers[name],
  );
}
