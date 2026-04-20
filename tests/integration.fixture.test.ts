import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(__dirname, "..");
const FIXTURE_DIR = path.resolve(__dirname, "fixture-app");
const BASE_URL = "http://localhost:3111";

let devServer: ChildProcessWithoutNullStreams | undefined;

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "pipe",
      env: { ...process.env },
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${command} ${args.join(" ")}):\n${stderr}`));
    });
  });
}

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Fixture server did not start in time.");
}

async function request(
  input: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20_000);
  try {
    return await fetch(`${BASE_URL}${input}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

describe("fixture app integration", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    await run("pnpm", ["build"], ROOT_DIR);
    await run("pnpm", ["install"], FIXTURE_DIR);

    devServer = spawn("pnpm", ["dev"], {
      cwd: FIXTURE_DIR,
      stdio: "pipe",
      env: { ...process.env },
    });

    await waitForServer();
  }, 180_000);

  afterAll(async () => {
    if (devServer && !devServer.killed) {
      devServer.kill("SIGTERM");
    }
  });

  it("serves markdown for Accept: text/markdown", async () => {
    const res = await request("/", {
      headers: { Accept: "text/markdown" },
    });
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("# Fixture Home");
  });

  it("serves markdown for .md suffix", async () => {
    const res = await request("/docs.md");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("# Docs");
  });

  it("serves markdown for format=md while preserving other params", async () => {
    const res = await request("/echo?format=md&lang=en");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("lang=en");
  });

  it("blocks GPTBot user agent per category policy", async () => {
    const res = await request("/", {
      headers: { "User-Agent": "GPTBot/1.0" },
    });
    expect(res.status).toBe(403);
  });

  it("blocks Bytespider when trainingScrapers policy is block", async () => {
    const res = await request("/", {
      headers: { "User-Agent": "Bytespider/1.0" },
    });
    expect(res.status).toBe(403);
  });

  it("keeps normal browser traffic as HTML", async () => {
    const res = await request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("serves llms.txt", async () => {
    const res = await request("/llms.txt");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("# Fixture App");
    expect(body).toContain("[Home](/)");
  });

  it("does not intercept api routes", async () => {
    const res = await request("/api/something");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, source: "api" });
  });

  it("returns markdown 404 when redirected to login", async () => {
    const res = await request("/protected.md");
    const body = await res.text();
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("requires authentication");
  });

  it("serves markdown for repeated markdown requests", async () => {
    const first = await request("/random.md");
    const firstBody = await first.text();
    const second = await request("/random.md");
    const secondBody = await second.text();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody).toContain("## Random");
    expect(secondBody).toContain("## Random");
  });

  it("does not loop infinitely on internal self-fetch paths", async () => {
    const res = await request("/docs.md", { timeoutMs: 8_000 });
    expect(res.status).toBe(200);
  });
});
