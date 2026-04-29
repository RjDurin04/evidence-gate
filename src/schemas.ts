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
