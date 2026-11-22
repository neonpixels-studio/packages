#!/usr/bin/env node
import { runAuditGate } from "./audit-gate/run.ts";

process.exitCode = runAuditGate(process.argv.slice(2));
