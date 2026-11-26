import type { ConsentService } from "@neon-pixels/consent";

const SERVICE_PHRASES: Record<ConsentService, string> = {
  analytics: "analytics to see how it is used",
  sessionReplay: "session replay to find and fix bugs",
};

export interface ConsentCopy {
  request: string;
  offNotice: string;
}

// Names only the configured services, and says they are off unless allowed.
export function describeConsent(
  services: readonly ConsentService[],
): ConsentCopy {
  const phrases = services.map((service) => SERVICE_PHRASES[service]);
  return {
    request: `This site would like to use ${phrases.join(" and ")}.`,
    offNotice:
      services.length > 1
        ? "Both are off unless you allow them."
        : "It is off unless you allow it.",
  };
}
