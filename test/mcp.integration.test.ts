import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("stdio MCP server", () => {
  it("lists tools and calls core tools over stdio", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-mcp-"));
    await mkdir(join(workspace, "src"));
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        name: "fixture-app",
        scripts: {
          test: "node -e \"console.log('should not run without --allow-scripts')\""
        },
        dependencies: {
          zod: "^4.0.0"
        }
      })
    );
    await writeFile(join(workspace, "src", "index.ts"), "export const fixtureValue = 'alpha';\n");

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"),
        join(projectRoot, "src", "index.ts"),
        "--workspace",
        workspace
      ],
      cwd: projectRoot,
      stderr: "pipe"
    });
    const client = new Client({ name: "evidence-gate-test-client", version: "0.1.0" });

    await client.connect(transport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map(tool => tool.name)).toEqual(
        expect.arrayContaining([
          "repo.snapshot",
          "repo.searchEvidence",
          "claim.check",
          "task.contract",
          "impact.map",
          "patch.verify",
          "proof.report"
        ])
      );

      const snapshot = await client.callTool({ name: "repo.snapshot", arguments: {} });
      expect(snapshot.structuredContent?.packageName).toBe("fixture-app");
      expect(snapshot.structuredContent?.packageManager).toBe("npm");

      const search = await client.callTool({
        name: "repo.searchEvidence",
        arguments: { pattern: "fixtureValue", maxMatches: 10 }
      });
      expect((search.structuredContent?.evidence as unknown[]).length).toBeGreaterThan(0);

      const verify = await client.callTool({
        name: "patch.verify",
        arguments: { checks: ["test"], timeoutMs: 10000 }
      });
      expect(verify.structuredContent?.status).toBe("skipped");
      expect(verify.structuredContent?.scriptExecutionAllowed).toBe(false);
    } finally {
      await client.close();
    }
  }, 30000);
});
