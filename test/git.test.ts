import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGitSnapshot } from "../src/core/git.js";
import { runCommand } from "../src/core/exec.js";

describe("getGitSnapshot", () => {
  it("includes untracked files in changedFiles", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-git-"));
    const gitAvailable = await runCommand("git", ["--version"], workspace, 10000, 1000);

    if (gitAvailable.exitCode !== 0) {
      return;
    }

    const init = await runCommand("git", ["init"], workspace, 10000, 4000);
    expect(init.exitCode).toBe(0);

    await mkdir(join(workspace, "src"));
    await writeFile(join(workspace, "src", "new-file.ts"), "export const value = 1;\n");

    const snapshot = await getGitSnapshot(workspace);
    expect(snapshot.isGitRepo).toBe(true);
    expect(snapshot.dirtyFiles).toContain("src/new-file.ts");
    expect(snapshot.changedFiles).toContain("src/new-file.ts");
  });
});
