import { DeliveryError } from "./errors.ts";
import { postJson } from "./http.ts";
import {
  escapeSlackText,
  orPlaceholder,
  safeLink,
  singleLine,
  truncate,
} from "./text.ts";
import { parseSlackWebhookUrl } from "./urls.ts";
import type { Channel, Notification } from "./types.ts";

export const SLACK_HEADER_MAX = 150;
export const SLACK_SECTION_TEXT_MAX = 3000;
export const SLACK_FIELD_TEXT_MAX = 2000;
export const SLACK_FIELDS_MAX = 10;
const SLACK_BUTTON_URL_MAX = 3000;
const SLACK_TEXT_MAX = 3000;

export interface SlackChannelOptions {
  webhookUrl: string;
}

function plainText(text: string) {
  return { type: "plain_text", text, emoji: false };
}

function fieldBlocks(notification: Notification) {
  const fields = notification.fields ?? [];
  const shown = fields.slice(0, SLACK_FIELDS_MAX).map((field) => {
    const text = `${orPlaceholder(singleLine(field.label))}\n${orPlaceholder(field.value)}`;
    return plainText(truncate(text, SLACK_FIELD_TEXT_MAX));
  });
  if (shown.length === 0) {
    return [];
  }
  return [{ type: "section", fields: shown }];
}

function contextBlock(notification: Notification) {
  const omitted = Math.max(
    0,
    (notification.fields?.length ?? 0) - SLACK_FIELDS_MAX,
  );
  const parts = [`Severity: ${notification.severity}`];
  if (omitted > 0) {
    parts.push(`${omitted} more fields omitted`);
  }
  return { type: "context", elements: [plainText(parts.join(" | "))] };
}

function linkBlocks(notification: Notification) {
  const link = safeLink(notification.link);
  if (!link || link.length > SLACK_BUTTON_URL_MAX) {
    return [];
  }
  return [
    {
      type: "actions",
      elements: [{ type: "button", text: plainText("Open"), url: link }],
    },
  ];
}

/**
 * Title, body, and fields go out as `plain_text`, which Slack never parses for
 * mentions or markup. The top-level fallback `text` is mrkdwn by default, so it
 * is escaped and `mrkdwn` is turned off as well.
 */
export function renderSlackPayload(notification: Notification) {
  const title = orPlaceholder(singleLine(notification.title));
  const blocks: unknown[] = [
    { type: "header", text: plainText(truncate(title, SLACK_HEADER_MAX)) },
  ];
  if (notification.body.trim() !== "") {
    blocks.push({
      type: "section",
      text: plainText(truncate(notification.body, SLACK_SECTION_TEXT_MAX)),
    });
  }
  blocks.push(
    ...fieldBlocks(notification),
    contextBlock(notification),
    ...linkBlocks(notification),
  );
  return {
    text: truncate(
      escapeSlackText(`[${notification.severity}] ${title}`),
      SLACK_TEXT_MAX,
    ),
    mrkdwn: false,
    blocks,
  };
}

export function slackChannel(options: SlackChannelOptions): Channel {
  const { webhookUrl } = options;
  return {
    name: "slack",
    async deliver(notification, context) {
      const url = parseSlackWebhookUrl(webhookUrl);
      if (!url) {
        throw new DeliveryError("invalid webhook url");
      }
      await postJson(context, url, renderSlackPayload(notification));
    },
  };
}
