import type { BrowserWindow } from "./types.ts";

interface CookieWindow {
  document?: { cookie: string };
  location?: { hostname?: string };
}

const EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpAddress(hostname: string): boolean {
  return IPV4.test(hostname) || hostname.includes(":");
}

/** The host and each parent domain below the top level: a.b.com gives a.b.com, b.com. */
export function candidateDomains(hostname: string): string[] {
  const labels = hostname.split(".");
  if (labels.length < 2) {
    return [hostname];
  }
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
}

function isGoogleAnalyticsCookie(name: string): boolean {
  return name === "_ga" || name.startsWith("_ga_");
}

function cookieNames(cookie: string): string[] {
  return cookie
    .split(";")
    .map((pair) => pair.split("=")[0]!.trim())
    .filter(isGoogleAnalyticsCookie);
}

function expire(document: { cookie: string }, name: string, domain?: string) {
  const domainPart = domain === undefined ? "" : `; domain=${domain}`;
  document.cookie = `${name}=; expires=${EXPIRED}; max-age=0; path=/${domainPart}`;
}

function expireEverywhere(
  document: { cookie: string },
  name: string,
  domains: string[],
) {
  expire(document, name);
  for (const domain of domains) {
    expire(document, name, domain);
  }
}

/** Expires the `_ga` and `_ga_*` cookies on the host and each parent domain. IP hosts get no parent domains. */
export function clearGoogleAnalyticsCookies(browserWindow: BrowserWindow) {
  const { document, location } = browserWindow as CookieWindow;
  if (document === undefined) {
    return;
  }
  const hostname = location?.hostname ?? "";
  const domains =
    hostname === "" || isIpAddress(hostname) ? [] : candidateDomains(hostname);
  for (const name of cookieNames(document.cookie)) {
    expireEverywhere(document, name, domains);
  }
}
