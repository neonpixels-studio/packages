#!/usr/bin/env node
import { runCheckMigrationSnapshots } from "./migrations/snapshots-run.ts";

process.exitCode = await runCheckMigrationSnapshots(process.argv.slice(2));
