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
