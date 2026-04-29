import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPatch } from "../src/core/verify.js";

describe("verifyPatch", () => {
  it("does not run repository scripts unless explicitly allowed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-verify-"));
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"require('fs').writeFileSync('script-ran.txt', 'ran')\""
        }
      })
    );

    const result = await verifyPatch(workspace, {
      checks: ["test"],
      timeoutMs: 10000,
      allowScripts: false,
      maxOutputChars: 1000
    });

    expect(result.status).toBe("skipped");
    expect(result.scriptExecutionAllowed).toBe(false);
    await expect(readFile(join(workspace, "script-ran.txt"), "utf8")).rejects.toThrow();
  }, 20000);

  it("truncates command output when scripts are allowed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-verify-"));
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"console.log('x'.repeat(5000))\""
        }
      })
    );

    const result = await verifyPatch(workspace, {
      checks: ["test"],
      timeoutMs: 10000,
      allowScripts: true,
      maxOutputChars: 500
    });

    expect(result.status).toBe("pass");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]?.outputTruncated).toBe(true);
    expect(result.commands[0]?.output.length).toBeLessThanOrEqual(500);
  }, 20000);
});
