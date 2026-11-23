#!/usr/bin/env node
import { runAbsentDependencyCheck } from "./absent-dependency/run.ts";

process.exitCode = runAbsentDependencyCheck(process.argv.slice(2));
