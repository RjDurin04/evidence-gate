import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkClaim } from "../src/core/claims.js";

describe("checkClaim", () => {
  it("returns verified when an indicator is present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(join(workspace, "package.json"), JSON.stringify({ dependencies: { prisma: "^1.0.0" } }));

    const result = await checkClaim(workspace, {
      statement: "Project uses Prisma",
      indicators: ["prisma"],
      contradictions: [],
      requireAllIndicators: true,
      includeDocumentation: false,
      maxMatches: 10
    });

    expect(result.status).toBe("verified");
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("returns unknown when no indicator is present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(join(workspace, "README.md"), "hello");

    const result = await checkClaim(workspace, {
      statement: "Project uses Prisma",
      indicators: ["prisma"],
      contradictions: [],
      requireAllIndicators: true,
      includeDocumentation: false,
      maxMatches: 10
    });

    expect(result.status).toBe("unknown");
  });

  it("does not verify claims from documentation by default", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "evidence-gate-"));
    await writeFile(join(workspace, "README.md"), "This project may use prisma later.");

    const result = await checkClaim(workspace, {
      statement: "Project uses Prisma",
      indicators: ["prisma"],
      contradictions: [],
      requireAllIndicators: true,
      includeDocumentation: false,
      maxMatches: 10
    });

    expect(result.status).toBe("unknown");
  });
});
