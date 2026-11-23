#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { runSyncTemplates } from "./template-sync/run.ts";

// `src/` and `dist/` both sit beside `templates/`.
process.exitCode = runSyncTemplates(process.argv.slice(2), {
  root: process.cwd(),
  templatesRoot: fileURLToPath(new URL("../templates", import.meta.url)),
});
