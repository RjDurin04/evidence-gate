import { execa } from "execa";
import { platform } from "node:os";
import type { CommandRunResult } from "../types.js";

interface ProcessErrorLike {
  message?: string;
  shortMessage?: string;
  all?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timedOut?: boolean;
}

function truncateOutput(output: string, maxOutputChars: number): { output: string; outputTruncated: boolean } {
  if (output.length <= maxOutputChars) {
    return { output, outputTruncated: false };
  }

  const suffix = `\n[output truncated to ${maxOutputChars} characters by evidence-gate]\n`;
  return {
    output: `${output.slice(0, Math.max(0, maxOutputChars - suffix.length))}${suffix}`,
    outputTruncated: true
  };
}

export async function hasCommand(command: string, cwd: string): Promise<boolean> {
  const locator = platform() === "win32" ? "where" : "which";
  try {
    const result = await execa(locator, [command], {
      cwd,
      reject: false,
      all: true,
      shell: false,
      windowsHide: true
    });

    if (result.exitCode !== 0) {
      return false;
    }

    const probe = await execa(command, ["--version"], {
      cwd,
      reject: false,
      all: true,
      timeout: 5000,
      shell: false,
      windowsHide: true
    });

    return probe.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  maxOutputChars = 60000
): Promise<CommandRunResult> {
  const startedAt = Date.now();

  try {
    const result = await execa(command, args, {
      cwd,
      reject: false,
      all: true,
      timeout: timeoutMs,
      shell: false,
      windowsHide: true
    });
    const capped = truncateOutput(String(result.all ?? result.stdout ?? result.stderr ?? ""), maxOutputChars);

    return {
      command,
      args,
      exitCode: result.exitCode ?? 1,
      durationMs: Date.now() - startedAt,
      output: capped.output,
      outputTruncated: capped.outputTruncated,
      timedOut: Boolean(result.timedOut)
    };
  } catch (error) {
    const processError = error as ProcessErrorLike;
    const rawOutput = String(
      processError.all ??
        [processError.stdout, processError.stderr, processError.shortMessage, processError.message]
          .filter(Boolean)
          .join("\n")
    );
    const capped = truncateOutput(rawOutput, maxOutputChars);

    return {
      command,
      args,
      exitCode: processError.exitCode ?? 1,
      durationMs: Date.now() - startedAt,
      output: capped.output,
      outputTruncated: capped.outputTruncated,
      timedOut: Boolean(processError.timedOut)
    };
  }
}
