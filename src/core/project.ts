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
