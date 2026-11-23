export interface SecurityHeadersOptions {
  /** Adds Strict-Transport-Security and X-Frame-Options. Off by default so local development is unaffected. */
  production?: boolean;
  /** Adds `preload` to Strict-Transport-Security. Only applies in production. */
  hstsPreload?: boolean;
  /** Features denied in Permissions-Policy in addition to camera, microphone, and geolocation. */
  extraDeniedFeatures?: readonly string[];
}

const BASE_DENIED_FEATURES = ["camera", "microphone", "geolocation"];
const HSTS_MAX_AGE_SECONDS = 63_072_000;
const FEATURE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function permissionsPolicy(extraDeniedFeatures: readonly string[]): string {
  const features = new Set([...BASE_DENIED_FEATURES, ...extraDeniedFeatures]);
  return [...features]
    .map((feature) => {
      if (!FEATURE_NAME_PATTERN.test(feature)) {
        throw new TypeError(`Invalid Permissions-Policy feature: ${feature}`);
      }
      return `${feature}=()`;
    })
    .join(", ");
}

function strictTransportSecurity(hstsPreload: boolean): string {
  const base = `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`;
  return hstsPreload ? `${base}; preload` : base;
}

/** Returns the baseline security response headers as a plain record. */
export function securityHeaders(
  options: SecurityHeadersOptions = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": permissionsPolicy(options.extraDeniedFeatures ?? []),
  };
  if (!options.production) {
    return headers;
  }
  headers["Strict-Transport-Security"] = strictTransportSecurity(
    Boolean(options.hstsPreload),
  );
  headers["X-Frame-Options"] = "DENY";
  return headers;
}
