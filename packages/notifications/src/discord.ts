import { DeliveryError } from "./errors.ts";
import { postJson } from "./http.ts";
import {
  escapeDiscordText,
  orPlaceholder,
  safeLink,
  singleLine,
  truncate,
} from "./text.ts";
import { parseDiscordWebhookUrl } from "./urls.ts";
import type { Channel, Notification, Severity } from "./types.ts";

export const DISCORD_TITLE_MAX = 256;
export const DISCORD_DESCRIPTION_MAX = 4096;
export const DISCORD_FIELD_NAME_MAX = 256;
export const DISCORD_FIELD_VALUE_MAX = 1024;
export const DISCORD_FIELDS_MAX = 25;
export const DISCORD_EMBED_TOTAL_MAX = 6000;
const FOOTER_RESERVE = 100;
const MIN_FIELD_VALUE_LENGTH = 20;

const SEVERITY_COLORS: Record<Severity, number> = {
  info: 0x3498db,
  warning: 0xf1c40f,
  error: 0xe74c3c,
};

export interface DiscordChannelOptions {
  webhookUrl: string;
}

interface EmbedField {
  name: string;
  value: string;
}

/** Fields are added in order until the embed's combined 6000-character budget is spent. */
function fitFields(notification: Notification, budget: number): EmbedField[] {
  const fitted: EmbedField[] = [];
  let remaining = budget;
  for (const field of (notification.fields ?? []).slice(
    0,
    DISCORD_FIELDS_MAX,
  )) {
    const name = truncate(
      escapeDiscordText(orPlaceholder(singleLine(field.label))),
      DISCORD_FIELD_NAME_MAX,
    );
    const value = truncate(
      escapeDiscordText(orPlaceholder(field.value)),
      Math.min(DISCORD_FIELD_VALUE_MAX, remaining - name.length),
    );
    if (remaining - name.length < MIN_FIELD_VALUE_LENGTH) {
      break;
    }
    fitted.push({ name, value });
    remaining -= name.length + value.length;
  }
  return fitted;
}

function footerText(notification: Notification, omitted: number): string {
  const suffix = omitted > 0 ? ` | ${omitted} more fields omitted` : "";
  return `${notification.severity}${suffix}`;
}

/**
 * Mentions are switched off with `allowed_mentions.parse = []`, and markdown
 * and `<` are backslash-escaped so caller text renders as written.
 */
export function renderDiscordPayload(notification: Notification) {
  const title = truncate(
    escapeDiscordText(orPlaceholder(singleLine(notification.title))),
    DISCORD_TITLE_MAX,
  );
  const description = truncate(
    escapeDiscordText(notification.body),
    DISCORD_DESCRIPTION_MAX,
  );
  const fieldBudget =
    DISCORD_EMBED_TOTAL_MAX -
    title.length -
    description.length -
    FOOTER_RESERVE;
  const fields = fitFields(notification, fieldBudget);
  const omitted = (notification.fields?.length ?? 0) - fields.length;
  const link = safeLink(notification.link);
  return {
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title,
        ...(description.trim() === "" ? {} : { description }),
        ...(link ? { url: link } : {}),
        color: SEVERITY_COLORS[notification.severity],
        fields: fields.map((field) => ({ ...field, inline: false })),
        footer: { text: footerText(notification, omitted) },
      },
    ],
  };
}

export function discordChannel(options: DiscordChannelOptions): Channel {
  const { webhookUrl } = options;
  return {
    name: "discord",
    async deliver(notification, context) {
      const url = parseDiscordWebhookUrl(webhookUrl);
      if (!url) {
        throw new DeliveryError("invalid webhook url");
      }
      await postJson(context, url, renderDiscordPayload(notification));
    },
  };
}
