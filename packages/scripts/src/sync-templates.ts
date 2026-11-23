#!/usr/bin/env node
import { runSyncTemplates } from "./template-sync/run.ts";

process.exitCode = runSyncTemplates(process.argv.slice(2));
