# Evidence Gate MCP

Evidence Gate MCP is a local Model Context Protocol (MCP) server that gives AI coding tools a fact-checking and verification layer for your repository. 

It does not generate code. Instead, it gives coding agents structured, local, evidence-backed answers about the codebase:
- What files, scripts, dependencies, and languages exist.
- Whether a claim is supported, contradicted, or unknown.
- Where exact evidence appears, with file paths and line numbers.
- What changed in git.
- Which local checks passed or failed.
- What proof artifact can be saved for human review.

The core idea is **"proof-carrying vibe coding"**: every meaningful claim made by an AI agent should be traceable to repository facts or command output.

## The Problem It Solves

AI coding tools are incredibly powerful, but they can confidently state things that are not grounded in your actual repository. Common failure modes include:
- Claiming a package, framework, file, route, or test exists when it does not.
- Editing code without checking imports, call sites, or scripts.
- Saying "tests pass" without actually running tests.
- Ignoring dirty git state.
- Dumping too much context into the model instead of precise evidence.
- Confusing generic knowledge about a framework with local project facts.
- Producing final summaries that sound legitimate but are not verifiable.

Evidence Gate solves this by turning repository inspection into structured MCP tools with explicit, conservative statuses:
- `verified`: evidence found locally.
- `contradicted`: local evidence conflicts with the claim.
- `unknown`: not enough local evidence (this tool prefers `unknown` over false positives).

## Beginner-Friendly User Guide

### 1. Installation (via GitHub)

Clone this repository and install it globally on your machine:

```bash
git clone https://github.com/RjDurin04/evidence-gate.git
cd evidence-gate
npm install
npm run build
npm install -g .
```

*(Note: The server uses Node.js, so make sure you have Node installed - v24 LTS or newer is recommended).*

### 2. Running Locally

Once installed globally, you can run the server directly via the CLI, pointing it to your project workspace:

```bash
evidence-gate-mcp --workspace /absolute/path/to/your/project
```

**Important:** Package scripts are disabled by default for security. If you trust the repository and want the AI to run local checks (like `npm run test` or `npm run lint`), enable them with the `--allow-scripts` flag:

```bash
evidence-gate-mcp --workspace /absolute/path/to/your/project --allow-scripts
```

### 3. Setting up with your AI Coding Tool (e.g., Claude Desktop, Cursor)

To integrate Evidence Gate with an MCP-compatible client like Claude Desktop, you need to add it to your `mcp.json` (or equivalent client configuration file). 

**If you installed the package globally (as shown in Step 1):**

```json
{
  "mcpServers": {
    "evidence-gate": {
      "command": "evidence-gate-mcp",
      "args": [
        "--workspace", 
        "/absolute/path/to/your/project",
        "--allow-scripts"
      ]
    }
  }
}
```

*(Remove `--allow-scripts` if you don't want to allow the agent to run project scripts).*

**Alternatively, running it directly from the cloned repository using Node:**

```json
{
  "mcpServers": {
    "evidence-gate": {
      "command": "node",
      "args": [
        "/absolute/path/to/cloned/evidence-gate/dist/index.js",
        "--workspace", 
        "/absolute/path/to/your/project"
      ]
    }
  }
}
```

### 4. What Tools Does It Give The AI?

Once connected, your AI coding agent will have access to these local tools:

- `repo.snapshot`: Gets a compact summary of repository facts (dependencies, scripts, git state).
- `repo.searchEvidence`: Searches the repository for exact code snippets, returning file paths and line numbers.
- `claim.check`: Classifies a claim as `verified`, `contradicted`, or `unknown` based on explicit evidence in the code.
- `task.contract`: Creates a deterministic implementation contract from a user request.
- `impact.map`: Inspects the blast radius of code changes (e.g., finding nearby tests or references).
- `patch.verify`: Runs safe, allowlisted local checks (like `typecheck`, `lint`, `test`, `build`) if `--allow-scripts` is enabled.
- `proof.report`: Saves an auditable proof bundle under a `.evidence-gate/` directory for human review.

---

## Local Development

If you want to contribute or build the project locally:

```bash
npm install
npm run dev -- --workspace /path/to/your/test/repo
```

### Verification Suite

Run the full local verification suite to test your changes:

```bash
npm run verify
```

That command runs:
- Source and test typechecking
- Unit tests
- MCP stdio integration tests
- Production build
- `npm pack --dry-run`

## Security Model

Evidence Gate is built with a strong focus on local security and predictability:
- **Local stdio only**: It runs locally, without relying on paid APIs or external services.
- **No network calls**: The MCP server itself does not make network calls. (Enabled package scripts may perform whatever the trusted repository's scripts do).
- **No shell interpolation**: Uses safe subprocess execution.
- **Opt-in execution**: Verification runs only allowlisted package scripts (`test`, `lint`, `typecheck`, `build`), and *only* when `--allow-scripts` is enabled for a trusted workspace.
- **Path constrained**: All readable paths are constrained to the workspace using lexical and realpath checks. Symlinked files that resolve outside the workspace are rejected.
- **Output caps**: Command output is capped before it is returned to the AI.
- **Conservative verification**: The tool intentionally returns `unknown` when evidence is insufficient, preventing AI hallucinations.

## Production-readiness boundary

This package is built as a production-oriented MVP. It includes locked dependencies, symlink-aware workspace path checks, disabled-by-default package script execution, command output caps, unit tests, MCP stdio integration tests, and CI for Windows, macOS, and Linux.

No software can honestly be guaranteed bug-free. Treat `0.x` releases as beta until the package has real-world usage, external security review, and CI history on all target platforms.
