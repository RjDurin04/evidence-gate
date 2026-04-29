#!/usr/bin/env node
import { runCli } from "./cli.js";

runCli().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`evidence-gate-mcp failed: ${message}`);
  process.exitCode = 1;
});
