#!/usr/bin/env node
import { runCheckMigrationDrift } from "./migrations/drift-run.ts";

process.exitCode = await runCheckMigrationDrift(process.argv.slice(2));
