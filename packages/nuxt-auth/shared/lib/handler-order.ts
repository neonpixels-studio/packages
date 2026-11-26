type HandlerEntry = { handler?: unknown };

/**
 * Nitro lists the app's own server middleware before a layer's, because the
 * app's directory is scanned first. Moves the entries `isFirst` matches to the
 * front, in their original order, and leaves every other entry where it was.
 */
export function moveHandlersToFront<Entry extends HandlerEntry>(
  handlers: Entry[],
  isFirst: (handlerPath: string) => boolean,
): Entry[] {
  const matches = (entry: Entry): boolean =>
    typeof entry.handler === "string" && isFirst(entry.handler);
  if (!handlers.some(matches)) {
    throw new Error(
      "@neon-pixels/nuxt-auth: its server middleware was not found among Nitro's handlers, so it cannot run before the app's own middleware.",
    );
  }
  return [
    ...handlers.filter(matches),
    ...handlers.filter((entry) => !matches(entry)),
  ];
}
