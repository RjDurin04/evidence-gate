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
