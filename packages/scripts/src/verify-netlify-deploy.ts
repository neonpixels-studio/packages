#!/usr/bin/env node
import { runVerifyNetlifyDeploy } from "./verify-deploy/run.ts";

process.exitCode = await runVerifyNetlifyDeploy(process.argv.slice(2));
