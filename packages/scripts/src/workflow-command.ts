export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Workflow commands are line-based, so text from Netlify must not be able to
// end the message or start a new command.
export function escapeWorkflowCommand(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
