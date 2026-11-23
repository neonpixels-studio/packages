interface CookieWrite {
  name: string;
  domain: string | undefined;
}

/** A window with a cookie jar that deletes by name and logs every write. */
export function createFakeWindow(
  options: { hostname?: string; cookies?: string } = {},
) {
  const jar = new Map<string, string>();
  for (const pair of (options.cookies ?? "").split(";").filter(Boolean)) {
    const [name, value] = pair.trim().split("=");
    jar.set(name!, value ?? "");
  }
  const writes: CookieWrite[] = [];
  const document = {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(assignment: string) {
      const [pair, ...attributes] = assignment
        .split(";")
        .map((part) => part.trim());
      const name = pair!.split("=")[0]!;
      const domain = attributes
        .find((attribute) => attribute.startsWith("domain="))
        ?.slice("domain=".length);
      writes.push({ name, domain });
      if (attributes.includes("max-age=0")) {
        jar.delete(name);
      }
    },
  };
  return {
    document,
    location: { hostname: options.hostname ?? "example.com" },
    writes,
    cookieNames: () => [...jar.keys()],
  };
}
