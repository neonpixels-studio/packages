#!/usr/bin/env node
import { runActionPinningCheck } from "./action-pinning/run.ts";

process.exitCode = runActionPinningCheck();
