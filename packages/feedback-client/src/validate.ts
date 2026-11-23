import type { FeedbackInput, FeedbackProblem } from "./types.ts";

/** The receiver's field limits, in characters after trimming. */
export const FEEDBACK_LIMITS = {
  message: 10_000,
  title: 120,
  email: 254,
  url: 2_000,
} as const;

const OPTIONAL_FIELDS = ["title", "email", "url"] as const;

function checkLength(
  field: keyof typeof FEEDBACK_LIMITS,
  value: string,
): FeedbackProblem | undefined {
  if (value.trim().length <= FEEDBACK_LIMITS[field]) {
    return undefined;
  }
  return {
    field,
    message: `${field} must be at most ${FEEDBACK_LIMITS[field]} characters.`,
  };
}

function checkMessage(value: unknown): FeedbackProblem | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return { field: "message", message: "message must be a non-empty string." };
  }
  return checkLength("message", value);
}

function checkOptional(
  field: (typeof OPTIONAL_FIELDS)[number],
  value: unknown,
): FeedbackProblem | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return { field, message: `${field} must be a string.` };
  }
  return checkLength(field, value);
}

/** Lists what the receiver would reject. Never throws, whatever the input. */
export function validateFeedback(input: unknown): FeedbackProblem[] {
  const source: Partial<Record<keyof FeedbackInput, unknown>> =
    typeof input === "object" && input !== null ? input : {};
  const problems = [
    checkMessage(source.message),
    ...OPTIONAL_FIELDS.map((field) => checkOptional(field, source[field])),
  ];
  return problems.filter((problem) => problem !== undefined);
}
