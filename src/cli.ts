import { Command } from "commander";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEvidenceGateServer } from "./mcp/server.js";

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name("evidence-gate-mcp")
    .description("Local proof-carrying verification MCP for AI-assisted coding.")
    .version("0.1.0")
    .option("-w, --workspace <path>", "Repository workspace path", process.cwd())
    .option("--allow-scripts", "Allow running allowlisted package scripts in this trusted workspace", false)
    .option(
      "--max-command-output-chars <chars>",
      "Maximum command output characters returned through MCP",
      parsePositiveInteger,
      60000
    );

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    program.outputHelp();
    return;
  }

  if (process.argv.includes("--version") || process.argv.includes("-V")) {
    console.log(program.version());
    return;
  }

  program.parse(process.argv);

  const options = program.opts<{
    workspace: string;
    allowScripts: boolean;
    maxCommandOutputChars: number;
  }>();
  const workspace = resolve(options.workspace);
  const workspaceStat = await stat(workspace);

  if (!workspaceStat.isDirectory()) {
    throw new Error(`Workspace is not a directory: ${workspace}`);
  }

  const server = createEvidenceGateServer({
    workspace,
    allowScripts: options.allowScripts,
    maxCommandOutputChars: options.maxCommandOutputChars
  });
  const transport = new StdioServerTransport();

  await server.connect(transport);
}
