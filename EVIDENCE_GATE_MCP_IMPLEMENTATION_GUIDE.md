# Evidence Gate MCP Implementation Guide

Status: implementation blueprint for a realistic MVP  
Project type: npm package plus local stdio MCP server  
Working package name: `@evidence-gate/mcp`  
Target user: developers using AI coding agents who want local, evidence-backed verification before trusting generated code  
Date grounded: 2026-04-29

Implementation note: the real package now exists in this workspace root. The root source files, tests, lockfile, and CI config are the source of truth. Some embedded snippets in this guide describe the original blueprint and may be less current than the implemented files.

## 1. What Is It All About

Evidence Gate MCP is a local Model Context Protocol server that gives AI coding tools a fact-checking and verification layer for a repository.

It does not generate code. It gives coding agents structured, local, evidence-backed answers about the codebase:

- What files, scripts, dependencies, and languages exist.
- Whether a claim is supported, contradicted, or unknown.
- Where exact evidence appears, with file paths and line numbers.
- What changed in git.
- Which local checks passed or failed.
- What proof artifact can be saved for human review.

The important product idea is "proof-carrying vibe coding": every meaningful claim made by the agent should be traceable to repository facts or command output.

### One-sentence MVP

A free, local-only MCP server that lets AI coding agents call tools like `repo.snapshot`, `repo.searchEvidence`, `claim.check`, `impact.map`, `patch.verify`, and `proof.report` so coding work becomes auditable instead of vibes-only.

## 2. Problem It Is Trying To Solve

AI coding tools are powerful, but they can confidently say things that are not grounded in the actual repository.

Common failure modes:

- Claiming a package, framework, file, route, or test exists when it does not.
- Editing code without checking imports, call sites, or scripts.
- Saying "tests pass" without running tests.
- Ignoring dirty git state.
- Dumping too much context into the model instead of precise evidence.
- Confusing generic knowledge about a framework with local project facts.
- Producing final summaries that sound legitimate but are not verifiable.

Evidence Gate solves this by turning repository inspection into structured MCP tools with explicit statuses:

- `verified`: evidence found locally.
- `contradicted`: local evidence conflicts with the claim.
- `unknown`: not enough local evidence.

This is intentionally conservative. The MVP should prefer `unknown` over a false positive.

## 3. What Makes This Legitimate And Realistically Implementable

This MVP uses existing stable building blocks:

- Node.js LTS for local CLI and MCP execution.
- TypeScript for type-safe implementation.
- Official MCP TypeScript SDK v1.x for a local stdio server.
- Zod for input schema validation.
- Execa for safe subprocess execution without shell interpolation.
- `git`, package scripts, and optional `rg` for local repo facts.
- No paid APIs.
- No remote service.
- No LLM dependency inside the tool.

### Verified technology choices

The versions below were checked from package/documentation sources on 2026-04-29. Before publishing, run `npm view <package> version` locally and update the pins if needed.

| Technology | Version used in this guide | Reason |
|---|---:|---|
| Node.js | `>=24.0.0` recommended | Node.js official releases page lists v24 as LTS and v24.15.0 as latest LTS in the page footer. |
| TypeScript | `^6.0.3` | npm registry latest endpoint returned TypeScript 6.0.3. |
| `@modelcontextprotocol/sdk` | `^1.29.0` | Security/package sources show 1.29.0 as latest stable v1 package; official SDK docs still describe v1 as the recommended production path while v2 is in development. |
| Zod | `^4.3.6` | Package index sources show Zod 4.3.6 as latest stable. |
| Commander | `^14.0.3` | Verified with `npm view commander version` on 2026-04-29. |
| Execa | `^9.6.1` | Verified with `npm view execa version` on 2026-04-29. |
| jsonc-parser | `^3.3.1` | npm package page lists 3.3.1 as latest. |
| tsx | `^4.21.0` | Verified with `npm view tsx version` on 2026-04-29. |
| Vitest | `^4.1.5` | Verified with `npm view vitest version` on 2026-04-29. |

## 4. Non-goals

This MVP does not claim to:

- Prove the entire program is correct.
- Replace unit, integration, or security tests.
- Guarantee production safety.
- Perform semantic reasoning better than a compiler.
- Autonomously edit files.
- Collect secrets.
- Send source code to any cloud service.
- Guarantee global novelty against every private or unpublished tool.

It only proves local, inspectable facts and command results.

## 5. Project Architecture

### Runtime architecture

```txt
AI coding client
  |
  | MCP stdio
  v
@evidence-gate/mcp
  |
  | local read-only repo inspection
  | local allowlisted command execution
  v
Workspace repository
  |
  |- git metadata
  |- package.json scripts
  |- source files
  |- tests
  |- optional rg binary
  |- optional semgrep binary
```

### Internal architecture

```txt
src/index.ts
  starts CLI

src/cli.ts
  parses --workspace and --version
  starts stdio MCP transport

src/mcp/server.ts
  registers MCP tools
  converts core results to structured MCP outputs

src/core/project.ts
  detects package manager, scripts, dependencies, language map

src/core/search.ts
  searches with rg when available, otherwise JS fallback

src/core/claims.ts
  checks explicit claims against explicit indicators and contradictions

src/core/impact.ts
  maps changed files to likely references and nearby tests

src/core/verify.ts
  runs allowlisted package scripts

src/core/proof.ts
  writes .evidence-gate/proof.json and .evidence-gate/proof.md

src/core/git.ts
  reads git status, commit, changed files

src/core/files.ts
  safe file reading, JSONC parsing, repo walking

src/core/exec.ts
  safe process execution using execa

src/schemas.ts
  shared Zod schemas

src/types.ts
  shared TypeScript types
```

### Data flow for a typical agent session

```txt
1. Agent calls repo.snapshot
2. Agent calls repo.searchEvidence for relevant terms
3. Agent calls claim.check for each important claim
4. Agent edits code using its normal editor/tools
5. Agent calls impact.map to inspect blast radius
6. Agent calls patch.verify to run tests/lint/typecheck/build
7. Agent calls proof.report to save an auditable proof bundle
8. Agent final answer cites evidence and verification status
```

## 6. MCP Tool Contract

### `repo.snapshot`

Purpose: return a compact repository fact summary.

Returns:

- Workspace path.
- Git commit.
- Dirty files.
- Package manager.
- Package scripts.
- Dependencies.
- Language counts.
- Important files.

### `repo.searchEvidence`

Purpose: search the repository and return evidence with exact file, line, column, and snippet.

Inputs:

- `pattern`: search pattern.
- `fixedString`: default `true`.
- `maxMatches`: default `50`.

### `claim.check`

Purpose: classify a claim as `verified`, `contradicted`, or `unknown`.

Important design rule: the caller must provide explicit indicators. The tool does not infer broad semantic truth from a natural-language sentence.

The production MVP should default to conservative checks:

- Every indicator must be found unless `requireAllIndicators` is set to `false`.
- Markdown and documentation files are ignored unless `includeDocumentation` is set to `true`.
- A missing indicator returns `unknown`, not `verified`.

Example:

```json
{
  "statement": "The app uses Prisma",
  "indicators": ["@prisma/client", "schema.prisma"],
  "contradictions": [],
  "requireAllIndicators": true,
  "includeDocumentation": false
}
```

### `task.contract`

Purpose: create a deterministic implementation contract from a user request and current repo facts.

Returns:

- Requested task.
- Candidate checks.
- Candidate risk areas.
- Required proof steps.

The word "candidate" matters: this tool suggests, it does not pretend to understand the business domain.

### `impact.map`

Purpose: map changed files to likely references and nearby tests.

Inputs:

- `files`: optional file list. If omitted, it uses git changed files.

### `patch.verify`

Purpose: run safe, allowlisted local checks.

Production safety rule: package scripts are disabled by default because a repository controls the contents of `npm run test`, `npm run build`, and similar scripts. Start the MCP server with `--allow-scripts` only for workspaces you trust.

Allowed scripts by default:

- `typecheck`
- `lint`
- `test`
- `build`

No arbitrary shell command execution in the MVP. Package scripts are also disabled by default because package scripts are repository-controlled code.

### `proof.report`

Purpose: save a proof bundle under `.evidence-gate/`.

Outputs:

- `.evidence-gate/proof.json`
- `.evidence-gate/proof.md`

## 7. Project Structure

```txt
evidence-gate-mcp/
  package.json
  tsconfig.json
  README.md
  LICENSE
  src/
    index.ts
    cli.ts
    types.ts
    schemas.ts
    mcp/
      server.ts
    core/
      claims.ts
      exec.ts
      files.ts
      git.ts
      impact.ts
      project.ts
      proof.ts
      search.ts
      verify.ts
  test/
    claims.test.ts
    files.test.ts
    project.test.ts
```

## 8. Code For Each File

### `package.json`

```json
{
  "name": "@evidence-gate/mcp",
  "version": "0.1.0",
  "description": "Local proof-carrying verification MCP for AI-assisted coding.",
  "type": "module",
  "license": "MIT",
  "private": false,
  "bin": {
    "evidence-gate-mcp": "./dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "prepack": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "commander": "^14.0.3",
    "execa": "^9.6.1",
    "jsonc-parser": "^3.3.1",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^24.12.2",
    "tsx": "^4.21.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "test"]
}
```

### `README.md`

````md
# Evidence Gate MCP

Evidence Gate MCP is a local proof-carrying verification server for AI-assisted coding.

It exposes MCP tools that help coding agents ground their claims in local repository evidence:

- `repo.snapshot`
- `repo.searchEvidence`
- `claim.check`
- `task.contract`
- `impact.map`
- `patch.verify`
- `proof.report`

It does not send code to a remote service. It does not use a paid API. It runs locally over MCP stdio.

## Install

```bash
npm install -g @evidence-gate/mcp
```

## Run

```bash
evidence-gate-mcp --workspace /path/to/your/repo
```

Package scripts are disabled by default. Enable them only for repositories you trust:

```bash
evidence-gate-mcp --workspace /path/to/your/repo --allow-scripts
```

## Claude Desktop style config

```json
{
  "mcpServers": {
    "evidence-gate": {
      "command": "evidence-gate-mcp",
      "args": ["--workspace", "/absolute/path/to/your/repo"]
    }
  }
}
```

## Local development

```bash
npm install
npm run dev -- --workspace /path/to/repo
```

## Security model

- Local stdio only.
- No network calls in the MCP server itself. Enabled package scripts may perform whatever the trusted repository's scripts do.
- No shell interpolation.
- Verification runs only allowlisted package scripts, and only when `--allow-scripts` is enabled for a trusted workspace.
- All paths are constrained to the workspace.
- Command output is capped before it is returned through MCP.
- The tool returns `unknown` when evidence is insufficient.
````

### `LICENSE`

```txt
MIT License

Copyright (c) 2026 Evidence Gate contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `src/index.ts`

```ts
#!/usr/bin/env node
import { runCli } from "./cli.js";

runCli().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`evidence-gate-mcp failed: ${message}`);
  process.exitCode = 1;
});
```

### `src/cli.ts`

```ts
import { Command } from "commander";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEvidenceGateServer } from "./mcp/server.js";

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name("evidence-gate-mcp")
    .description("Local proof-carrying verification MCP for AI-assisted coding.")
    .version("0.1.0")
    .option("-w, --workspace <path>", "Repository workspace path", process.cwd())
    .option("--allow-scripts", "Allow running allowlisted package scripts in this trusted workspace", false)
    .option(
      "--max-command-output-chars <chars>",
      "Maximum command output characters returned through MCP",
      parsePositiveInteger,
      60000
    )
    .parse(process.argv);

  const options = program.opts<{
    workspace: string;
    allowScripts: boolean;
    maxCommandOutputChars: number;
  }>();
  const workspace = resolve(options.workspace);
  const workspaceStat = await stat(workspace);

  if (!workspaceStat.isDirectory()) {
    throw new Error(`Workspace is not a directory: ${workspace}`);
  }

  const server = createEvidenceGateServer({
    workspace,
    allowScripts: options.allowScripts,
    maxCommandOutputChars: options.maxCommandOutputChars
  });
  const transport = new StdioServerTransport();

  await server.connect(transport);
}
```

### `src/types.ts`

```ts
export type ClaimStatus = "verified" | "contradicted" | "unknown";

export interface EvidenceLocation {
  path: string;
  line: number;
  column: number;
  text: string;
}

export interface CommandRunResult {
  command: string;
  args: string[];
  exitCode: number;
  durationMs: number;
  output: string;
  outputTruncated: boolean;
  timedOut: boolean;
}

export interface GitSnapshot {
  isGitRepo: boolean;
  commit: string | null;
  branch: string | null;
  dirtyFiles: string[];
  changedFiles: string[];
}

export interface ProjectSnapshot {
  workspace: string;
  generatedAt: string;
  git: GitSnapshot;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";
  packageName: string | null;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  languageCounts: Record<string, number>;
  importantFiles: string[];
}

export interface ClaimCheckResult {
  statement: string;
  status: ClaimStatus;
  evidence: EvidenceLocation[];
  contradictions: EvidenceLocation[];
  reason: string;
}

export interface VerificationResult {
  generatedAt: string;
  packageManager: string;
  commands: CommandRunResult[];
  status: "pass" | "fail" | "skipped";
  scriptExecutionAllowed: boolean;
  reason: string | null;
}

export interface ImpactMap {
  files: string[];
  references: Record<string, EvidenceLocation[]>;
  nearbyTests: Record<string, string[]>;
}

export interface ProofBundle {
  schemaVersion: 1;
  generatedAt: string;
  snapshot: ProjectSnapshot;
  verification: VerificationResult | null;
  claims: ClaimCheckResult[];
  impact: ImpactMap | null;
  unknowns: string[];
}
```

### `src/schemas.ts`

```ts
import { z } from "zod";

const evidencePattern = z.string().min(1).max(500);

export const searchEvidenceInput = {
  pattern: evidencePattern,
  fixedString: z.boolean().default(true),
  maxMatches: z.number().int().min(1).max(500).default(50)
};

export const claimCheckInput = {
  statement: z.string().min(1).max(1000),
  indicators: z.array(evidencePattern).min(1).max(20),
  contradictions: z.array(evidencePattern).max(20).default([]),
  requireAllIndicators: z.boolean().default(true),
  includeDocumentation: z.boolean().default(false),
  maxMatches: z.number().int().min(1).max(200).default(50)
};

export const taskContractInput = {
  request: z.string().min(1).max(5000)
};

export const impactMapInput = {
  files: z.array(z.string().min(1)).optional()
};

export const patchVerifyInput = {
  checks: z.array(z.string().min(1).max(80)).max(10).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).default(120000)
};

export const proofReportInput = {
  includeMarkdown: z.boolean().default(true)
};
```

### `src/core/exec.ts`

```ts
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
```

### `src/core/files.ts`

```ts
import { parse as parseJsonc } from "jsonc-parser";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".evidence-gate"
]);

export function toWorkspacePath(workspace: string, inputPath: string): string {
  const workspaceRoot = resolve(workspace);
  const absolute = resolve(workspaceRoot, inputPath);
  const rel = relative(workspaceRoot, absolute);

  if (rel === "") {
    return workspaceRoot;
  }

  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }

  return absolute;
}

export function toRelativePath(workspace: string, absolutePath: string): string {
  return relative(workspace, absolutePath).replaceAll("\\", "/");
}

export async function readTextFile(workspace: string, inputPath: string): Promise<string> {
  const absolute = toWorkspacePath(workspace, inputPath);
  return readFile(absolute, "utf8");
}

export async function readJsoncFile<T>(workspace: string, inputPath: string): Promise<T | null> {
  try {
    const text = await readTextFile(workspace, inputPath);
    return parseJsonc(text) as T;
  } catch {
    return null;
  }
}

export async function fileExists(workspace: string, inputPath: string): Promise<boolean> {
  try {
    const absolute = toWorkspacePath(workspace, inputPath);
    const item = await stat(absolute);
    return item.isFile() || item.isDirectory();
  } catch {
    return false;
  }
}

export async function walkFiles(workspace: string, maxFiles = 10000): Promise<string[]> {
  const results: string[] = [];

  async function visit(dir: string): Promise<void> {
    if (results.length >= maxFiles) {
      return;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }

      if (DEFAULT_IGNORES.has(entry.name)) {
        continue;
      }

      const absolute = join(dir, entry.name);

      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        results.push(toRelativePath(workspace, absolute));
      }
    }
  }

  await visit(workspace);
  return results;
}

export function extensionOf(path: string): string {
  const ext = extname(path).toLowerCase();
  return ext === "" ? "[no extension]" : ext;
}

export function lineAt(text: string, oneBasedLine: number): string {
  return text.split(/\r?\n/)[oneBasedLine - 1] ?? "";
}
```

### `src/core/git.ts`

```ts
import { runCommand } from "./exec.js";
import type { GitSnapshot } from "../types.js";

const GIT_TIMEOUT_MS = 15000;

async function git(workspace: string, args: string[]) {
  return runCommand("git", args, workspace, GIT_TIMEOUT_MS);
}

function parseStatusPath(line: string): string | null {
  if (line.length < 4) return null;

  const rawPath = line.slice(3).trim();
  if (!rawPath) return null;

  const renameSeparator = " -> ";
  const renameIndex = rawPath.lastIndexOf(renameSeparator);
  return renameIndex >= 0 ? rawPath.slice(renameIndex + renameSeparator.length) : rawPath;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function getGitSnapshot(workspace: string): Promise<GitSnapshot> {
  const inside = await git(workspace, ["rev-parse", "--is-inside-work-tree"]);

  if (inside.exitCode !== 0 || !inside.output.includes("true")) {
    return {
      isGitRepo: false,
      commit: null,
      branch: null,
      dirtyFiles: [],
      changedFiles: []
    };
  }

  const [commit, branch, status, changed] = await Promise.all([
    git(workspace, ["rev-parse", "HEAD"]),
    git(workspace, ["branch", "--show-current"]),
    git(workspace, ["status", "--short"]),
    git(workspace, ["diff", "--name-only", "HEAD"])
  ]);

  const dirtyFiles = status.output
    .split(/\r?\n/)
    .map(parseStatusPath)
    .filter((item): item is string => item !== null);

  const diffFiles = changed.output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  return {
    isGitRepo: true,
    commit: commit.exitCode === 0 ? commit.output.trim() : null,
    branch: branch.exitCode === 0 ? branch.output.trim() || null : null,
    dirtyFiles: unique(dirtyFiles),
    changedFiles: unique([...diffFiles, ...dirtyFiles])
  };
}
```

### `src/core/project.ts`

```ts
import { readJsoncFile, walkFiles, extensionOf, fileExists } from "./files.js";
import { getGitSnapshot } from "./git.js";
import type { ProjectSnapshot } from "../types.js";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function detectPackageManager(workspace: string): Promise<ProjectSnapshot["packageManager"]> {
  if (await fileExists(workspace, "pnpm-lock.yaml")) return "pnpm";
  if (await fileExists(workspace, "yarn.lock")) return "yarn";
  if (await fileExists(workspace, "bun.lockb")) return "bun";
  if (await fileExists(workspace, "bun.lock")) return "bun";
  if (await fileExists(workspace, "package-lock.json")) return "npm";
  if (await fileExists(workspace, "package.json")) return "npm";
  return "unknown";
}

export async function getProjectSnapshot(workspace: string): Promise<ProjectSnapshot> {
  const packageJson = await readJsoncFile<PackageJson>(workspace, "package.json");
  const files = await walkFiles(workspace);
  const languageCounts: Record<string, number> = {};

  for (const file of files) {
    const ext = extensionOf(file);
    languageCounts[ext] = (languageCounts[ext] ?? 0) + 1;
  }

  const importantCandidates = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "next.config.js",
    "next.config.mjs",
    "src/index.ts",
    "src/main.ts",
    "src/app.ts",
    "README.md"
  ];

  const importantFiles: string[] = [];
  for (const candidate of importantCandidates) {
    if (await fileExists(workspace, candidate)) {
      importantFiles.push(candidate);
    }
  }

  return {
    workspace,
    generatedAt: new Date().toISOString(),
    git: await getGitSnapshot(workspace),
    packageManager: await detectPackageManager(workspace),
    packageName: packageJson?.name ?? null,
    scripts: packageJson?.scripts ?? {},
    dependencies: packageJson?.dependencies ?? {},
    devDependencies: packageJson?.devDependencies ?? {},
    languageCounts,
    importantFiles
  };
}
```

### `src/core/search.ts`

```ts
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
```

### `src/core/claims.ts`

```ts
import { searchEvidence } from "./search.js";
import type { ClaimCheckResult, EvidenceLocation } from "../types.js";

export async function checkClaim(
  workspace: string,
  input: {
    statement: string;
    indicators: string[];
    contradictions: string[];
    requireAllIndicators: boolean;
    includeDocumentation: boolean;
    maxMatches: number;
  }
): Promise<ClaimCheckResult> {
  const evidence: EvidenceLocation[] = [];
  const contradictions: EvidenceLocation[] = [];
  const missingIndicators: string[] = [];

  for (const indicator of input.indicators) {
    const matches = await searchEvidence(workspace, indicator, {
      fixedString: true,
      maxMatches: input.maxMatches
    });
    const filtered = input.includeDocumentation ? matches : matches.filter(match => !isDocumentationPath(match.path));

    if (filtered.length === 0) {
      missingIndicators.push(indicator);
    }

    evidence.push(...filtered);
  }

  for (const contradiction of input.contradictions) {
    const matches = await searchEvidence(workspace, contradiction, {
      fixedString: true,
      maxMatches: input.maxMatches
    });
    contradictions.push(...(input.includeDocumentation ? matches : matches.filter(match => !isDocumentationPath(match.path))));
  }

  if (contradictions.length > 0) {
    return {
      statement: input.statement,
      status: "contradicted",
      evidence: evidence.slice(0, input.maxMatches),
      contradictions: contradictions.slice(0, input.maxMatches),
      reason: "One or more explicit contradiction indicators were found in the repository."
    };
  }

  const hasRequiredEvidence = input.requireAllIndicators ? missingIndicators.length === 0 : evidence.length > 0;

  if (hasRequiredEvidence) {
    return {
      statement: input.statement,
      status: "verified",
      evidence: evidence.slice(0, input.maxMatches),
      contradictions: [],
      reason: input.requireAllIndicators
        ? "Every explicit support indicator was found in non-documentation repository evidence."
        : "At least one explicit support indicator was found in non-documentation repository evidence."
    };
  }

  return {
    statement: input.statement,
    status: "unknown",
    evidence: [],
    contradictions: [],
    reason:
      missingIndicators.length > 0
        ? `Missing required support indicators: ${missingIndicators.join(", ")}. The claim is not proven by local evidence.`
        : "No explicit support or contradiction indicators were found. The claim is not proven by local evidence."
  };
}

function isDocumentationPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized.endsWith(".md") ||
    normalized.startsWith("docs/") ||
    normalized.includes("/docs/") ||
    normalized.startsWith("documentation/") ||
    normalized.includes("/documentation/") ||
    normalized.includes("changelog") ||
    normalized.includes("license")
  );
}
```

### `src/core/impact.ts`

```ts
import { basename, dirname } from "node:path";
import { getGitSnapshot } from "./git.js";
import { searchEvidence } from "./search.js";
import { walkFiles } from "./files.js";
import type { ImpactMap } from "../types.js";

function withoutExtension(file: string): string {
  const base = basename(file);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}

function isTestFile(file: string): boolean {
  return /(\.|\/)(test|spec)\.[cm]?[tj]sx?$/.test(file) || file.includes("__tests__/");
}

export async function getImpactMap(workspace: string, files?: string[]): Promise<ImpactMap> {
  const git = await getGitSnapshot(workspace);
  const targetFiles = files && files.length > 0 ? files : git.changedFiles;
  const allFiles = await walkFiles(workspace);
  const references: ImpactMap["references"] = {};
  const nearbyTests: ImpactMap["nearbyTests"] = {};

  for (const file of targetFiles) {
    const symbol = withoutExtension(file);
    references[file] = await searchEvidence(workspace, symbol, {
      fixedString: true,
      maxMatches: 50
    });

    const folder = dirname(file).replaceAll("\\", "/");
    nearbyTests[file] = allFiles.filter(candidate => {
      return isTestFile(candidate) && (candidate.startsWith(folder) || candidate.includes(symbol));
    });
  }

  return {
    files: targetFiles,
    references,
    nearbyTests
  };
}
```

### `src/core/verify.ts`

```ts
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
```

### `src/core/proof.ts`

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProofBundle } from "../types.js";

export async function writeProofBundle(
  workspace: string,
  bundle: ProofBundle,
  includeMarkdown: boolean
): Promise<{ jsonPath: string; markdownPath: string | null }> {
  const outDir = join(workspace, ".evidence-gate");
  await mkdir(outDir, { recursive: true });

  const jsonPath = join(outDir, "proof.json");
  await writeFile(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  if (!includeMarkdown) {
    return { jsonPath, markdownPath: null };
  }

  const markdownPath = join(outDir, "proof.md");
  await writeFile(markdownPath, renderMarkdown(bundle), "utf8");

  return { jsonPath, markdownPath };
}

function renderMarkdown(bundle: ProofBundle): string {
  const verification = bundle.verification;
  const commandRows = verification?.commands
    .map(command => {
      const rendered = `${command.command} ${command.args.join(" ")}`;
      return `| \`${rendered}\` | ${command.exitCode} | ${command.durationMs} | ${command.outputTruncated} |`;
    })
    .join("\n") || "| _none_ | - | - | - |";

  const claimRows = bundle.claims
    .map(claim => {
      return `| ${escapePipe(claim.statement)} | ${claim.status} | ${claim.evidence.length} | ${claim.contradictions.length} |`;
    })
    .join("\n") || "| _none_ | - | - | - |";

  return `# Evidence Gate Proof

Generated: ${bundle.generatedAt}

## Repository

- Workspace: \`${bundle.snapshot.workspace}\`
- Git repo: ${bundle.snapshot.git.isGitRepo}
- Commit: \`${bundle.snapshot.git.commit ?? "unknown"}\`
- Branch: \`${bundle.snapshot.git.branch ?? "unknown"}\`
- Package manager: \`${bundle.snapshot.packageManager}\`
- Package: \`${bundle.snapshot.packageName ?? "unknown"}\`

## Verification

- Status: \`${verification?.status ?? "not run"}\`
- Reason: ${verification?.reason ?? "None"}
- Script execution allowed: ${verification?.scriptExecutionAllowed ?? false}

| Command | Exit code | Duration ms | Output truncated |
|---|---:|---:|---|
${commandRows}

## Claims

| Claim | Status | Evidence count | Contradiction count |
|---|---|---:|---:|
${claimRows}

## Unknowns

${bundle.unknowns.length === 0 ? "- None" : bundle.unknowns.map(item => `- ${item}`).join("\n")}
`;
}

function escapePipe(value: string): string {
  return value.replaceAll("|", "\\|");
}
```

### `src/mcp/server.ts`

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  claimCheckInput,
  impactMapInput,
  patchVerifyInput,
  proofReportInput,
  searchEvidenceInput,
  taskContractInput
} from "../schemas.js";
import { checkClaim } from "../core/claims.js";
import { getImpactMap } from "../core/impact.js";
import { getProjectSnapshot } from "../core/project.js";
import { searchEvidence } from "../core/search.js";
import { verifyPatch } from "../core/verify.js";
import { writeProofBundle } from "../core/proof.js";
import type { ClaimCheckResult, ImpactMap, ProofBundle, VerificationResult } from "../types.js";

interface ServerOptions {
  workspace: string;
  allowScripts: boolean;
  maxCommandOutputChars: number;
}

function textAndStructured<T>(payload: T) {
  const structuredContent = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent
  };
}

function candidateChecksFromScripts(scripts: Record<string, string>): string[] {
  return ["typecheck", "lint", "test", "build"].filter(script => Boolean(scripts[script]));
}

function candidateRiskAreas(request: string): string[] {
  const lower = request.toLowerCase();
  const risks = new Set<string>();

  if (lower.includes("auth") || lower.includes("login") || lower.includes("session")) {
    risks.add("authentication and authorization");
  }
  if (lower.includes("payment") || lower.includes("billing") || lower.includes("checkout")) {
    risks.add("payments and billing");
  }
  if (lower.includes("database") || lower.includes("migration") || lower.includes("schema")) {
    risks.add("database schema and persistence");
  }
  if (lower.includes("api") || lower.includes("route") || lower.includes("endpoint")) {
    risks.add("API contracts");
  }
  if (lower.includes("ui") || lower.includes("component") || lower.includes("page")) {
    risks.add("user-facing UI behavior");
  }

  if (risks.size === 0) {
    risks.add("changed files and their references");
  }

  return [...risks];
}

export function createEvidenceGateServer(options: ServerOptions): McpServer {
  const { workspace, allowScripts, maxCommandOutputChars } = options;
  const claims: ClaimCheckResult[] = [];
  let lastVerification: VerificationResult | null = null;
  let lastImpact: ImpactMap | null = null;

  const server = new McpServer(
    {
      name: "evidence-gate",
      version: "0.1.0"
    },
    {
      instructions:
        "Use this server to ground coding claims in local repository evidence. Prefer unknown over unsupported claims. Run patch.verify before claiming checks passed. Package scripts run only when the server was started with --allow-scripts."
    }
  );

  server.registerTool(
    "repo.snapshot",
    {
      title: "Repository Snapshot",
      description: "Return local repository facts: git state, package scripts, dependencies, language counts, and important files.",
      inputSchema: {}
    },
    async () => {
      return textAndStructured(await getProjectSnapshot(workspace));
    }
  );

  server.registerTool(
    "repo.searchEvidence",
    {
      title: "Search Evidence",
      description: "Search the local repository and return exact evidence locations.",
      inputSchema: searchEvidenceInput
    },
    async ({ pattern, fixedString, maxMatches }) => {
      const evidence = await searchEvidence(workspace, pattern, { fixedString, maxMatches });
      return textAndStructured({ pattern, evidence });
    }
  );

  server.registerTool(
    "claim.check",
    {
      title: "Check Claim",
      description: "Check an explicit claim against explicit support and contradiction indicators.",
      inputSchema: claimCheckInput
    },
    async input => {
      const result = await checkClaim(workspace, input);
      claims.push(result);
      return textAndStructured(result);
    }
  );

  server.registerTool(
    "task.contract",
    {
      title: "Task Contract",
      description: "Create a deterministic, evidence-oriented implementation contract from the user request and repo facts.",
      inputSchema: taskContractInput
    },
    async ({ request }) => {
      const snapshot = await getProjectSnapshot(workspace);
      const contract = {
        request,
        generatedAt: new Date().toISOString(),
        repoFacts: {
          packageManager: snapshot.packageManager,
          scripts: Object.keys(snapshot.scripts),
          dirtyFiles: snapshot.git.dirtyFiles
        },
        candidateChecks: candidateChecksFromScripts(snapshot.scripts),
        candidateRiskAreas: candidateRiskAreas(request),
        requiredProofSteps: [
          "Call repo.snapshot before editing.",
          "Call repo.searchEvidence for files, symbols, routes, dependencies, or framework claims.",
          "Call claim.check for any important final-answer claim.",
          "Call impact.map after edits.",
          "Call patch.verify before claiming checks passed.",
          "Call proof.report to save an auditable proof bundle."
        ],
        limitation:
          "This contract is deterministic and repo-grounded. It suggests checks and risks but does not infer full business requirements."
      };

      return textAndStructured(contract);
    }
  );

  server.registerTool(
    "impact.map",
    {
      title: "Impact Map",
      description: "Map changed or supplied files to likely references and nearby tests.",
      inputSchema: impactMapInput
    },
    async ({ files }) => {
      lastImpact = await getImpactMap(workspace, files);
      return textAndStructured(lastImpact);
    }
  );

  server.registerTool(
    "patch.verify",
    {
      title: "Verify Patch",
      description: "Run allowlisted local package scripts: typecheck, lint, test, build.",
      inputSchema: patchVerifyInput
    },
    async ({ checks, timeoutMs }) => {
      lastVerification = await verifyPatch(workspace, {
        checks,
        timeoutMs,
        allowScripts,
        maxOutputChars: maxCommandOutputChars
      });
      return textAndStructured(lastVerification);
    }
  );

  server.registerTool(
    "proof.report",
    {
      title: "Write Proof Report",
      description: "Write .evidence-gate/proof.json and optionally .evidence-gate/proof.md.",
      inputSchema: proofReportInput
    },
    async ({ includeMarkdown }) => {
      const snapshot = await getProjectSnapshot(workspace);
      const unknowns = claims.filter(claim => claim.status === "unknown").map(claim => claim.statement);
      const bundle: ProofBundle = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        snapshot,
        verification: lastVerification,
        claims,
        impact: lastImpact,
        unknowns
      };

      const written = await writeProofBundle(workspace, bundle, includeMarkdown);
      return textAndStructured({ written, bundle });
    }
  );

  return server;
}
```

### `test/claims.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkClaim } from "../src/core/claims.js";

describe("checkClaim", () => {
  it("returns verified when an indicator is present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(join(workspace, "package.json"), JSON.stringify({ dependencies: { prisma: "^1.0.0" } }));

    const result = await checkClaim(workspace, {
      statement: "Project uses Prisma",
      indicators: ["prisma"],
      contradictions: [],
      requireAllIndicators: true,
      includeDocumentation: false,
      maxMatches: 10
    });

    expect(result.status).toBe("verified");
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("returns unknown when no indicator is present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(join(workspace, "README.md"), "hello");

    const result = await checkClaim(workspace, {
      statement: "Project uses Prisma",
      indicators: ["prisma"],
      contradictions: [],
      requireAllIndicators: true,
      includeDocumentation: false,
      maxMatches: 10
    });

    expect(result.status).toBe("unknown");
  });

  it("does not verify claims from documentation by default", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(join(workspace, "README.md"), "This project may use prisma later.");

    const result = await checkClaim(workspace, {
      statement: "Project uses Prisma",
      indicators: ["prisma"],
      contradictions: [],
      requireAllIndicators: true,
      includeDocumentation: false,
      maxMatches: 10
    });

    expect(result.status).toBe("unknown");
  });
});
```

### `test/project.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getProjectSnapshot } from "../src/core/project.js";

describe("getProjectSnapshot", () => {
  it("detects npm package metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: { test: "vitest run" },
        dependencies: { zod: "^4.0.0" }
      })
    );
    await writeFile(join(workspace, "package-lock.json"), "{}");

    const snapshot = await getProjectSnapshot(workspace);

    expect(snapshot.packageManager).toBe("npm");
    expect(snapshot.packageName).toBe("demo");
    expect(snapshot.scripts.test).toBe("vitest run");
  });
});
```

### `test/files.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { toWorkspacePath } from "../src/core/files.js";

describe("toWorkspacePath", () => {
  it("allows normal workspace-relative paths", () => {
    const workspace = resolve("repo");
    expect(toWorkspacePath(workspace, "src/index.ts")).toBe(resolve(workspace, "src/index.ts"));
  });

  it("rejects parent directory traversal", () => {
    const workspace = resolve("repo");
    expect(() => toWorkspacePath(workspace, "../outside.txt")).toThrow(/escapes workspace/);
  });

  it("does not reject sibling-looking names inside the workspace", () => {
    const workspace = resolve("repo");
    expect(toWorkspacePath(workspace, "..secret")).toBe(resolve(workspace, "..secret"));
  });
});
```

## 9. Beginner Friendly Local Setup Guide

### Step 1: Install Node.js

Install the latest Node.js LTS from the official Node.js website.

Confirm installation:

```bash
node --version
npm --version
```

Recommended result:

```txt
node v24.x.x
npm 11.x.x or newer
```

### Step 2: Create the project folder

```bash
mkdir evidence-gate-mcp
cd evidence-gate-mcp
```

### Step 3: Create files

Create the project structure shown above and copy each code block into its matching file.

### Step 4: Install dependencies

```bash
npm install
```

### Step 5: Run typecheck and tests

```bash
npm run typecheck
npm test
```

### Step 6: Build

```bash
npm run build
```

### Step 7: Test the MCP server manually

From inside the package folder:

```bash
npm run dev -- --workspace /absolute/path/to/a/test/repo
```

This starts a stdio MCP server. It will look idle in a normal terminal because MCP clients communicate with it using JSON-RPC over stdin/stdout.

### Step 8: Use with an MCP-compatible coding client

Use the absolute path to the built `dist/index.js`.

Example config:

```json
{
  "mcpServers": {
    "evidence-gate": {
      "command": "node",
      "args": [
        "/absolute/path/to/evidence-gate-mcp/dist/index.js",
        "--workspace",
        "/absolute/path/to/your/repo"
      ]
    }
  }
}
```

Safer development config:

```json
{
  "mcpServers": {
    "evidence-gate": {
      "command": "node",
      "args": [
        "/absolute/path/to/evidence-gate-mcp/dist/index.js",
        "--workspace",
        "/absolute/path/to/your/repo"
      ]
    }
  }
}
```

Avoid unpinned `npx -y @evidence-gate/mcp` for serious use because it can pull a newer package version without review.

## 10. Publishing And Deployment Guide

### Local-only deployment

For private use, no npm publishing is required.

```bash
npm run build
npm link
evidence-gate-mcp --workspace /absolute/path/to/repo
```

Then configure your MCP client to run:

```txt
evidence-gate-mcp --workspace /absolute/path/to/repo
```

### npm package deployment

1. Create an npm account.

```bash
npm adduser
```

2. Confirm package contents.

```bash
npm pack --dry-run
```

3. Run checks.

```bash
npm run typecheck
npm test
npm run build
```

4. Publish public scoped package.

```bash
npm publish --access public
```

5. Install globally on another machine.

```bash
npm install -g @evidence-gate/mcp
```

6. Add MCP client config.

```json
{
  "mcpServers": {
    "evidence-gate": {
      "command": "evidence-gate-mcp",
      "args": ["--workspace", "/absolute/path/to/repo"]
    }
  }
}
```

### Recommended versioning

Use semantic versioning:

- `0.1.0`: initial local MVP.
- `0.2.0`: add resources and richer proof reports.
- `0.3.0`: add optional Semgrep CE integration.
- `1.0.0`: stable tool schemas, documented security policy, real-world usage.

## 11. Security And Safety Requirements

### Required for MVP

- Use stdio transport for local use.
- Do not open network ports.
- Do not send code to remote services.
- Do not accept arbitrary shell commands.
- Use `execa(command, args, { shell: false })`.
- Restrict verification to allowlisted package scripts.
- Disable package script execution by default.
- Cap command output before returning it through MCP.
- Resolve and validate workspace paths.
- Treat MCP tool annotations as hints, not security boundaries.
- Return `unknown` when evidence is insufficient.
- Write proof artifacts only inside the workspace.

### Future hardening

- Add `--read-only` mode that disables `proof.report`.
- Add `--allow-check <script>` CLI flags.
- Add `.evidence-gate.jsonc` config.
- Add max output size per command.
- Add command cancellation support.
- Add SARIF export.
- Add signed proof bundles.

## 12. Example Agent Workflow

User request:

```txt
Add email login validation and make sure tests pass.
```

Agent workflow:

```txt
1. repo.snapshot
2. task.contract with the user request
3. repo.searchEvidence for "login", "email", "validation"
4. claim.check for framework and dependency claims
5. Agent edits code
6. impact.map
7. patch.verify with ["typecheck", "lint", "test"]
8. proof.report
9. Agent final response cites exact checks and unknowns
```

Good final response pattern:

```txt
Implemented email validation in src/auth/login.ts.

Verified:
- npm run typecheck: passed
- npm run test: passed
- login validation references found in src/auth/login.ts and test/auth/login.test.ts

Proof saved:
- .evidence-gate/proof.json
- .evidence-gate/proof.md

Unknown:
- No e2e browser login test was present, so browser-level behavior was not proven.
```

## 13. MVP Limitations

The claim checker only checks explicit indicators. This is deliberate. Natural-language truth checking without a model would create false confidence.

The impact mapper is heuristic. It searches basenames and nearby tests. It does not replace TypeScript language service or full call graph analysis.

The verifier only runs package scripts. It does not create tests, install services, start databases, or infer missing environment variables.

The proof report is an audit artifact. It is not a formal proof.

## 14. Future Features

### High-value next additions

- TypeScript language service integration for symbol references.
- Semgrep CE optional adapter for static analysis.
- Test discovery per changed file.
- `.evidence-gate.jsonc` policy file.
- Proof diff between two runs.
- `claim.batchCheck`.
- `repo.readEvidenceRange` with line-range limits.
- `risk.scorePatch` based on touched files, dependencies, public API, tests, and failed checks.
- GitHub Actions mode that uploads proof artifacts.

### Possible `.evidence-gate.jsonc`

```jsonc
{
  "allowedChecks": ["typecheck", "lint", "test", "build"],
  "maxCommandOutputChars": 60000,
  "maxSearchMatches": 200,
  "writeProof": true,
  "ignore": ["node_modules", "dist", "coverage"]
}
```

## 15. Source Links Used For Grounding

- Node.js releases and LTS status: https://nodejs.org/en/about/previous-releases
- Node.js release blog index: https://nodejs.org/en/blog/release
- MCP tools specification: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP security best practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- MCP TypeScript SDK v1 docs: https://ts.sdk.modelcontextprotocol.io/
- MCP TypeScript SDK server docs: https://ts.sdk.modelcontextprotocol.io/documents/server.html
- MCP TypeScript SDK GitHub repository: https://github.com/modelcontextprotocol/typescript-sdk
- MCP SDK package security/version reference: https://security.snyk.io/package/npm/%40modelcontextprotocol%2Fsdk
- TypeScript npm registry latest endpoint: https://registry.npmjs.org/typescript/latest
- Zod package reference: https://www.npmjs.com/package/zod
- Commander package reference: https://www.npmjs.com/package/commander
- Execa package reference: https://www.npmjs.com/package/execa
- jsonc-parser package reference: https://www.npmjs.com/package/jsonc-parser
- tsx package reference: https://www.npmjs.com/package/tsx
- Vitest package reference: https://www.npmjs.com/package/vitest

## 16. Build Checklist

Use this checklist to implement the MVP without scope creep.

```txt
[ ] Create package.json
[ ] Create tsconfig.json
[ ] Create src/index.ts
[ ] Create src/cli.ts
[ ] Create shared types and schemas
[ ] Implement safe command runner
[ ] Implement safe file utilities
[ ] Implement git snapshot
[ ] Implement project snapshot
[ ] Implement evidence search
[ ] Implement claim checker
[ ] Implement impact mapper
[ ] Implement patch verifier
[ ] Implement proof writer
[ ] Register MCP tools
[ ] Add tests
[ ] Run typecheck
[ ] Run tests
[ ] Build package
[ ] Test from MCP client
[ ] Publish only after local verification
```

## 17. Verification Performed On This Guide

The scaffold in this guide was extracted into a temporary local project and verified on 2026-04-29.

Commands run successfully:

```txt
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
node dist/index.js --help
node dist/index.js --version
```

Observed results:

```txt
npm install: 162 packages installed, 0 vulnerabilities reported by npm audit during install
npm run typecheck: passed
npm test: 3 test files passed, 7 tests passed
npm run build: passed
npm pack --dry-run: generated package contents successfully
node dist/index.js --help: printed CLI help successfully
node dist/index.js --version: printed 0.1.0
```

Production-readiness statement:

```txt
This is production-oriented MVP code that compiles, builds, packages, and passes the included tests.
No software can honestly be guaranteed to have zero bugs or zero future problems.
Before public production use, add real MCP-client integration tests, cross-platform CI, security review, and more repository fixtures.
```
