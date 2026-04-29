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

  const [commit, branch, status, unstaged, staged, untracked] = await Promise.all([
    git(workspace, ["rev-parse", "HEAD"]),
    git(workspace, ["branch", "--show-current"]),
    git(workspace, ["status", "--short"]),
    git(workspace, ["diff", "--name-only"]),
    git(workspace, ["diff", "--name-only", "--cached"]),
    git(workspace, ["ls-files", "--others", "--exclude-standard"])
  ]);

  const dirtyFiles = status.output
    .split(/\r?\n/)
    .map(parseStatusPath)
    .filter((item): item is string => item !== null);

  const diffFiles = [unstaged, staged, untracked].flatMap(result =>
    result.output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  );

  return {
    isGitRepo: true,
    commit: commit.exitCode === 0 ? commit.output.trim() : null,
    branch: branch.exitCode === 0 ? branch.output.trim() || null : null,
    dirtyFiles: unique([...dirtyFiles, ...diffFiles]),
    changedFiles: unique(diffFiles)
  };
}
