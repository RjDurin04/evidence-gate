import { hasCommand, runCommand } from "./exec.js";
import { readTextFile, walkFiles } from "./files.js";
import type { EvidenceLocation } from "../types.js";

const SEARCH_OUTPUT_LIMIT_CHARS = 2_000_000;

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".prisma",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs"
]);

function parseRipgrepLine(line: string): EvidenceLocation | null {
  const first = line.indexOf(":");
  if (first === -1) return null;

  const second = line.indexOf(":", first + 1);
  if (second === -1) return null;

  const third = line.indexOf(":", second + 1);
  if (third === -1) return null;

  const path = line.slice(0, first);
  const lineNumber = Number(line.slice(first + 1, second));
  const column = Number(line.slice(second + 1, third));
  const text = line.slice(third + 1);

  if (!Number.isFinite(lineNumber) || !Number.isFinite(column)) {
    return null;
  }

  return {
    path: path.replaceAll("\\", "/"),
    line: lineNumber,
    column,
    text
  };
}

export async function searchEvidence(
  workspace: string,
  pattern: string,
  options: { fixedString: boolean; maxMatches: number }
): Promise<EvidenceLocation[]> {
  if (await hasCommand("rg", workspace)) {
    const args = [
      "--line-number",
      "--column",
      "--hidden",
      "--glob",
      "!.git",
      "--glob",
      "!node_modules",
      "--glob",
      "!dist",
      "--glob",
      "!build",
      "--glob",
      "!coverage",
      "--max-filesize",
      "2M",
      "--max-count",
      String(Math.min(options.maxMatches, 50))
    ];

    if (options.fixedString) {
      args.push("--fixed-strings");
    }

    args.push(pattern, ".");

    const result = await runCommand("rg", args, workspace, 30000, SEARCH_OUTPUT_LIMIT_CHARS);

    if (result.exitCode > 1 || (result.exitCode === 1 && result.output.trim().length > 0)) {
      return searchEvidenceFallback(workspace, pattern, options);
    }

    return result.output
      .split(/\r?\n/)
      .map(parseRipgrepLine)
      .filter((item): item is EvidenceLocation => item !== null)
      .slice(0, options.maxMatches);
  }

  return searchEvidenceFallback(workspace, pattern, options);
}

async function searchEvidenceFallback(
  workspace: string,
  pattern: string,
  options: { fixedString: boolean; maxMatches: number }
): Promise<EvidenceLocation[]> {
  const files = await walkFiles(workspace);
  const evidence: EvidenceLocation[] = [];
  let matcher: RegExp | null = null;

  if (!options.fixedString) {
    try {
      matcher = new RegExp(pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid regular expression: ${message}`);
    }
  }

  for (const file of files) {
    if (evidence.length >= options.maxMatches) break;

    const extension = file.includes(".") ? file.slice(file.lastIndexOf(".")).toLowerCase() : "";
    if (!TEXT_EXTENSIONS.has(extension)) continue;

    let text: string;
    try {
      text = await readTextFile(workspace, file);
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      if (evidence.length >= options.maxMatches) break;

      const line = lines[index] ?? "";
      const column = options.fixedString ? line.indexOf(pattern) : line.search(matcher as RegExp);

      if (column >= 0) {
        evidence.push({
          path: file,
          line: index + 1,
          column: column + 1,
          text: line
        });
      }
    }
  }

  return evidence;
}
