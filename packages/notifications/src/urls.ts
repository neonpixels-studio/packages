const SLACK_HOST = "hooks.slack.com";
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com"]);
const DISCORD_PATH_PREFIX = "/api/webhooks/";

function parseHttpsUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    const url = new URL(value);
    const hasCredentialsOrPort =
      url.username !== "" || url.password !== "" || url.port !== "";
    return url.protocol === "https:" && !hasCredentialsOrPort ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Returns the normalized URL to send to, or undefined when it is not a Slack webhook. */
export function parseSlackWebhookUrl(value: unknown): string | undefined {
  const url = parseHttpsUrl(value);
  if (!url || url.hostname !== SLACK_HOST || url.pathname.length <= 1) {
    return undefined;
  }
  return url.href;
}

/** Returns the normalized URL to send to, or undefined when it is not a Discord webhook. */
export function parseDiscordWebhookUrl(value: unknown): string | undefined {
  const url = parseHttpsUrl(value);
  if (
    !url ||
    !DISCORD_HOSTS.has(url.hostname) ||
    !url.pathname.startsWith(DISCORD_PATH_PREFIX)
  ) {
    return undefined;
  }
  return url.pathname.length > DISCORD_PATH_PREFIX.length
    ? url.href
    : undefined;
}

export function isSlackWebhookUrl(value: unknown): boolean {
  return parseSlackWebhookUrl(value) !== undefined;
}

export function isDiscordWebhookUrl(value: unknown): boolean {
  return parseDiscordWebhookUrl(value) !== undefined;
}
