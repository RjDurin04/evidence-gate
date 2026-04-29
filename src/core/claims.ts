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
