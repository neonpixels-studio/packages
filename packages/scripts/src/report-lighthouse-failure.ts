#!/usr/bin/env node
import { runReportLighthouseFailure } from "./lighthouse/run.ts";

process.exitCode = await runReportLighthouseFailure(process.argv.slice(2));
