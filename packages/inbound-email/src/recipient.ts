import { parseAddress } from "./normalize.ts";
import type { InboundEmail, InboundRecipient } from "./types.ts";

export interface FindRecipientOptions {
  /** The app's inbound domain, such as `inbound.example.com`. Matched exactly. */
  domain: string;
}

function splitAddress(raw: string, domain: string): InboundRecipient | null {
  const address = parseAddress(raw)?.address.toLowerCase();
  const separator = address?.lastIndexOf("@") ?? -1;
  if (!address || separator < 1 || address.slice(separator + 1) !== domain) {
    return null;
  }
  const localWithTag = address.slice(0, separator);
  const plusIndex = localWithTag.indexOf("+");
  const local =
    plusIndex === -1 ? localWithTag : localWithTag.slice(0, plusIndex);
  const tag = plusIndex === -1 ? "" : localWithTag.slice(plusIndex + 1);
  if (local === "") {
    return null;
  }
  return { address, local, tag: tag === "" ? null : tag, domain };
}

/**
 * Returns the address at the inbound domain the message was delivered to.
 * Received-for addresses come first so forwarded and blind-copied mail resolves.
 */
export function findRecipient(
  email: Pick<InboundEmail, "receivedFor" | "to" | "cc" | "bcc">,
  options: FindRecipientOptions,
): InboundRecipient | null {
  const domain = options.domain.trim().toLowerCase();
  if (domain === "") {
    throw new TypeError("findRecipient requires a non-empty domain.");
  }
  const candidates = [
    ...email.receivedFor,
    ...email.to,
    ...email.cc,
    ...email.bcc,
  ];
  return (
    candidates
      .map((raw) => splitAddress(raw, domain))
      .find((recipient) => recipient !== null) ?? null
  );
}
