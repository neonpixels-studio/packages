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
  const full = address.slice(0, separator);
  const plus = full.indexOf("+");
  const local = plus === -1 ? full : full.slice(0, plus);
  const tag = plus === -1 ? "" : full.slice(plus + 1);
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
  for (const raw of [
    ...email.receivedFor,
    ...email.to,
    ...email.cc,
    ...email.bcc,
  ]) {
    const recipient = splitAddress(raw, domain);
    if (recipient) {
      return recipient;
    }
  }
  return null;
}
