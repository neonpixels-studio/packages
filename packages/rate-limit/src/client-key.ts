import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

const HASH_ALGORITHM = "sha256";
const IPV6_GROUP_COUNT = 8;
const IPV6_PREFIX_GROUPS = 4;
const IPV4_MAPPED_MARKER = 0xffff;
const BITS_PER_BYTE = 8;
const BYTE_MASK = 0xff;

function ipv4ToGroups(address: string): number[] {
  const [first = 0, second = 0, third = 0, fourth = 0] = address
    .split(".")
    .map(Number);
  return [(first << BITS_PER_BYTE) | second, (third << BITS_PER_BYTE) | fourth];
}

function groupsToIpv4(high: number, low: number): string {
  return [
    high >> BITS_PER_BYTE,
    high & BYTE_MASK,
    low >> BITS_PER_BYTE,
    low & BYTE_MASK,
  ].join(".");
}

function parseGroups(text: string): number[] {
  if (text === "") {
    return [];
  }
  return text.split(":").flatMap((part) => {
    return isIPv4(part) ? ipv4ToGroups(part) : [parseInt(part, 16)];
  });
}

function ipv6ToGroups(address: string): number[] {
  const withoutZone = address.split("%")[0] ?? address;
  const [head = "", tail = ""] = withoutZone.split("::");
  const headGroups = parseGroups(head);
  if (!withoutZone.includes("::")) {
    return headGroups;
  }
  const tailGroups = parseGroups(tail);
  const zeros = new Array<number>(
    Math.max(IPV6_GROUP_COUNT - headGroups.length - tailGroups.length, 0),
  ).fill(0);
  return [...headGroups, ...zeros, ...tailGroups];
}

function isIpv4Mapped(groups: number[]): boolean {
  return (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === IPV4_MAPPED_MARKER
  );
}

/**
 * The address a client is limited under: IPv4 as written (also when mapped
 * into IPv6, in any notation), IPv6 reduced to its /64 prefix so one customer
 * cannot mint new buckets by rotating the low 64 bits. Anything that is not an
 * IP address is returned trimmed and lowercased.
 */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  if (isIPv4(trimmed)) {
    return trimmed;
  }
  if (!isIPv6(trimmed)) {
    return trimmed;
  }

  const groups = ipv6ToGroups(trimmed);
  if (isIpv4Mapped(groups)) {
    return groupsToIpv4(groups[6] ?? 0, groups[7] ?? 0);
  }
  return groups
    .slice(0, IPV6_PREFIX_GROUPS)
    .map((group) => group.toString(16))
    .join(":");
}

/**
 * HMAC-SHA256 (hex) of the normalized address, keyed with `secret`. The raw
 * address is never part of the result, and without the secret the few billion
 * IPv4 values cannot be brute-forced back out, so an empty secret throws.
 */
export function clientKeyForAddress(address: string, secret: string): string {
  if (!secret) {
    throw new Error("clientKeyForAddress requires a non-empty secret");
  }
  const normalized = normalizeAddress(address);
  if (!normalized) {
    throw new Error("clientKeyForAddress requires a non-empty address");
  }
  return createHmac(HASH_ALGORITHM, secret).update(normalized).digest("hex");
}
