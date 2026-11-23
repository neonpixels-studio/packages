export { DeliveryError } from "./errors.ts";
export { discordChannel } from "./discord.ts";
export type { DiscordChannelOptions } from "./discord.ts";
export { emailChannel } from "./email.ts";
export type { EmailChannelOptions } from "./email.ts";
export { sendNotification } from "./send.ts";
export { slackChannel } from "./slack.ts";
export type { SlackChannelOptions } from "./slack.ts";
export { isDiscordWebhookUrl, isSlackWebhookUrl } from "./urls.ts";
export type {
  Channel,
  ChannelResult,
  DeliveryContext,
  FetchLike,
  Notification,
  NotificationField,
  SendOptions,
  Severity,
} from "./types.ts";
