import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileExists, readTextFile, toWorkspacePath, walkFiles } from "../src/core/files.js";

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

  it("rejects symlinked files that resolve outside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "evidence-gate-files-"));
    const workspace = join(root, "workspace");
    const outside = join(root, "outside.txt");
    const link = join(workspace, "outside-link.txt");

    await mkdir(workspace);
    await writeFile(outside, "secret outside workspace");

    try {
      await symlink(outside, link, "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") {
        return;
      }
      throw error;
    }

    await expect(readTextFile(workspace, "outside-link.txt")).rejects.toThrow(/escapes workspace/);
    await expect(fileExists(workspace, "outside-link.txt")).resolves.toBe(false);
  });

  it("does not walk symlinked files", async () => {
    const root = await mkdtemp(join(tmpdir(), "evidence-gate-walk-"));
    const workspace = join(root, "workspace");
    const outside = join(root, "outside.txt");
    const link = join(workspace, "outside-link.txt");

    await mkdir(workspace);
    await writeFile(join(workspace, "inside.txt"), "inside workspace");
    await writeFile(outside, "secret outside workspace");

    try {
      await symlink(outside, link, "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") {
        return;
      }
      throw error;
    }

    await expect(walkFiles(workspace)).resolves.toEqual(["inside.txt"]);
  });
});
