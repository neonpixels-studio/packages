import { validateSiteUrl } from "../../shared/lib/site-url.ts";

/**
 * The validated site origin from `runtimeConfig.public.siteUrl`. A missing or
 * invalid value is a 500. It never falls back to the request `Host` header.
 */
export function useSiteUrl(): string {
  const result = validateSiteUrl(useRuntimeConfig().public.siteUrl);
  if (!result.valid) {
    throw createError({ statusCode: 500, statusMessage: result.message });
  }
  return result.origin;
}
