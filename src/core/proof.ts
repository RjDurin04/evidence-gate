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
