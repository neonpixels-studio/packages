import { validateSiteUrl } from "../../shared/lib/site-url.ts";

/**
 * The validated site origin for canonical links and Open Graph tags. A missing
 * or invalid value throws a 500 error.
 */
export function useSiteUrl(): string {
  const result = validateSiteUrl(useRuntimeConfig().public.siteUrl);
  if (!result.valid) {
    throw createError({ statusCode: 500, statusMessage: result.message });
  }
  return result.origin;
}
