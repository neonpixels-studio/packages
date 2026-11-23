import type { BrowserWindow } from "./types.ts";

export const GTAG_SCRIPT_URL = "https://www.googletagmanager.com/gtag/js";

export interface ScriptElementLike {
  async: boolean;
  src: string;
}

export interface AnalyticsDocument {
  createElement(tagName: "script"): ScriptElementLike;
  head: { appendChild(node: never): unknown };
}

export interface AnalyticsBrowser {
  document: AnalyticsDocument;
  window: BrowserWindow;
}

interface DataLayerWindow {
  dataLayer?: unknown[];
  [flag: string]: unknown;
}

const injectedWindows = new WeakSet<object>();

export function disableFlagName(measurementId: string): string {
  return `ga-disable-${measurementId}`;
}

/** Sets the flag gtag.js checks before sending anything. */
export function setAnalyticsDisabled(
  browserWindow: BrowserWindow,
  measurementId: string,
  disabled: boolean,
) {
  (browserWindow as DataLayerWindow)[disableFlagName(measurementId)] = disabled;
}

// gtag.js only understands the `arguments` object, not an array.
function queueCommand(dataLayer: unknown[], ...args: unknown[]) {
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }
  gtag(...args);
}

/**
 * Injects gtag.js once per window, however often it is called. Google signals
 * and ad personalization are off. No Consent Mode commands are sent: the
 * caller loads this only after a grant.
 */
export function loadGoogleAnalytics(
  measurementId: string,
  { document, window }: AnalyticsBrowser,
) {
  setAnalyticsDisabled(window, measurementId, false);
  if (injectedWindows.has(window)) {
    return;
  }
  injectedWindows.add(window);
  const target = window as DataLayerWindow;
  const dataLayer = (target.dataLayer ??= []);
  queueCommand(dataLayer, "js", new Date());
  queueCommand(dataLayer, "config", measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `${GTAG_SCRIPT_URL}?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script as never);
}
