import { detectPackageManager } from "./project.js";
import { readJsoncFile } from "./files.js";
import { runCommand } from "./exec.js";
import type { CommandRunResult, VerificationResult } from "../types.js";

const DEFAULT_ALLOWED_CHECKS = ["typecheck", "lint", "test", "build"];

interface PackageJson {
  scripts?: Record<string, string>;
}

function commandForPackageManager(packageManager: string): string {
  if (packageManager === "pnpm") return "pnpm";
  if (packageManager === "yarn") return "yarn";
  if (packageManager === "bun") return "bun";
  return "npm";
}

export async function verifyPatch(
  workspace: string,
  input: { checks?: string[]; timeoutMs: number; allowScripts: boolean; maxOutputChars: number }
): Promise<VerificationResult> {
  const packageJson = await readJsoncFile<PackageJson>(workspace, "package.json");
  const scripts = packageJson?.scripts ?? {};
  const requestedChecks = input.checks && input.checks.length > 0 ? input.checks : DEFAULT_ALLOWED_CHECKS;
  const runnableChecks = requestedChecks.filter(check => DEFAULT_ALLOWED_CHECKS.includes(check) && scripts[check]);
  const packageManager = await detectPackageManager(workspace);
  const command = commandForPackageManager(packageManager);

  if (!input.allowScripts) {
    return {
      generatedAt: new Date().toISOString(),
      packageManager,
      commands: [],
      status: "skipped",
      scriptExecutionAllowed: false,
      reason: "Package script execution is disabled. Restart evidence-gate-mcp with --allow-scripts for a trusted workspace."
    };
  }

  if (runnableChecks.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      packageManager,
      commands: [],
      status: "skipped",
      scriptExecutionAllowed: true,
      reason: "No requested allowlisted package scripts were found."
    };
  }

  const commands: CommandRunResult[] = [];

  for (const check of runnableChecks) {
    const args = packageManager === "npm" ? ["run", check] : ["run", check];
    commands.push(await runCommand(command, args, workspace, input.timeoutMs, input.maxOutputChars));
  }

  return {
    generatedAt: new Date().toISOString(),
    packageManager,
    commands,
    status: commands.every(item => item.exitCode === 0) ? "pass" : "fail",
    scriptExecutionAllowed: true,
    reason: null
  };
}
