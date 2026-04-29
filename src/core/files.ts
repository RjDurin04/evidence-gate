import { parse as parseJsonc } from "jsonc-parser";
import type { Dirent } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
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

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export async function toRealWorkspacePath(workspace: string, inputPath: string): Promise<string> {
  const workspaceRoot = resolve(workspace);
  const workspaceReal = await realpath(workspaceRoot);
  const lexicalPath = toWorkspacePath(workspaceRoot, inputPath);
  const targetReal = await realpath(lexicalPath);

  if (!isPathInside(workspaceReal, targetReal)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }

  return targetReal;
}

export async function readTextFile(workspace: string, inputPath: string): Promise<string> {
  const absolute = await toRealWorkspacePath(workspace, inputPath);
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
    const absolute = await toRealWorkspacePath(workspace, inputPath);
    const item = await stat(absolute);
    return item.isFile() || item.isDirectory();
  } catch {
    return false;
  }
}

export async function walkFiles(workspace: string, maxFiles = 10000): Promise<string[]> {
  const results: string[] = [];
  const workspaceRoot = await realpath(resolve(workspace));

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
      if (entry.isSymbolicLink()) {
        continue;
      }

      let realAbsolute: string;
      try {
        realAbsolute = await realpath(absolute);
      } catch {
        continue;
      }

      if (!isPathInside(workspaceRoot, realAbsolute)) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(realAbsolute);
      } else if (entry.isFile()) {
        results.push(toRelativePath(workspaceRoot, realAbsolute));
      }
    }
  }

  await visit(workspaceRoot);
  return results;
}

export function extensionOf(path: string): string {
  const ext = extname(path).toLowerCase();
  return ext === "" ? "[no extension]" : ext;
}

export function lineAt(text: string, oneBasedLine: number): string {
  return text.split(/\r?\n/)[oneBasedLine - 1] ?? "";
}
