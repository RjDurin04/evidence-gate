import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getProjectSnapshot } from "../src/core/project.js";

describe("getProjectSnapshot", () => {
  it("detects npm package metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: { test: "vitest run" },
        dependencies: { zod: "^4.0.0" }
      })
    );
    await writeFile(join(workspace, "package-lock.json"), "{}");

    const snapshot = await getProjectSnapshot(workspace);

    expect(snapshot.packageManager).toBe("npm");
    expect(snapshot.packageName).toBe("demo");
    expect(snapshot.scripts.test).toBe("vitest run");
  });
});
