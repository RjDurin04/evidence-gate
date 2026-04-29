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
