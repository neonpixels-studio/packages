#!/usr/bin/env node
import { runShouldDeploy } from "./should-deploy/run.ts";

process.exitCode = await runShouldDeploy(process.argv.slice(2));
