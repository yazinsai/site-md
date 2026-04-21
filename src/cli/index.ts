import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const PKG_VERSION = (() => {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf8"),
    ).version as string;
  } catch {
    return "";
  }
})();
import * as p from "@clack/prompts";
import pico from "picocolors";
import { detectProject, installCommand } from "./detect";
import { freshConfig, mergeConfig } from "./merge-config";
import { mergeMiddleware } from "./merge-middleware";

const ROUTE_FILE = `export { GET } from "site-md/handler";
`;

const PURPOSE = {
  install: "adds the dependency",
  middleware: "routes .md requests",
  route: "serves /index.md",
  config: "generates /llms.txt at build",
} as const;

interface Flags {
  title?: string;
  description?: string;
  yes?: boolean;
  help?: boolean;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") f.yes = true;
    else if (a === "--help" || a === "-h") f.help = true;
    else if (a === "--title") f.title = argv[++i];
    else if (a === "--description") f.description = argv[++i];
    else if (a.startsWith("--title=")) f.title = a.slice(8);
    else if (a.startsWith("--description=")) f.description = a.slice(14);
  }
  return f;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }

  if (!flags.yes) console.clear();
  p.intro(
    `${pico.bgYellow(pico.black(" site-md "))} ${pico.dim(PKG_VERSION ? "v" + PKG_VERSION : "")}`,
  );

  p.log.message(
    [
      `Adds a ${pico.cyan(".md")} variant to every page in your Next.js app,`,
      `so AI agents can read your site without parsing HTML.`,
      pico.dim("Also publishes /llms.txt so crawlers know what's available."),
    ].join("\n"),
  );

  const project = await detect();
  if (!project) return;

  let title: string;
  let description: string;
  if (flags.title && flags.description) {
    title = flags.title;
    description = flags.description;
  } else {
    const answers = await askLlms(flags);
    if (p.isCancel(answers.title) || p.isCancel(answers.description)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    title = answers.title;
    description = answers.description;
  }

  const plan = planActions(project);
  p.log.step(pico.bold("Plan"));
  for (const line of plan) p.log.message(`  ${line}`);

  if (!flags.yes) {
    const go = await p.confirm({
      message: "Apply these changes?",
      initialValue: true,
    });
    if (p.isCancel(go) || !go) {
      p.cancel("Nothing changed.");
      process.exit(0);
    }
  }

  const written: string[] = [];

  // 1. Install package
  const installSpin = p.spinner();
  if (process.env.SITE_MD_SKIP_INSTALL) {
    installSpin.start("Install step");
    installSpin.stop(pico.dim("↷ skipped (SITE_MD_SKIP_INSTALL)"));
  } else {
    installSpin.start(`Installing site-md via ${pico.cyan(project.pkgManager)}`);
    try {
      await runInstall(project);
      for (const f of installedFiles(project)) written.push(f);
      installSpin.stop(
        `site-md installed via ${pico.cyan(project.pkgManager)}\n   ${pico.dim("↳ " + PURPOSE.install)}`,
      );
    } catch (err) {
      installSpin.stop(pico.red("Install failed"), 1);
      p.log.error((err as Error).message);
      process.exit(1);
    }
  }

  // 2. Middleware
  await stepMiddleware(project, written);

  // 3. Route
  await stepRoute(project, written);

  // 4. next.config
  await stepConfig(project, { title, description }, written);

  // 5. Git commit
  if (!flags.yes) {
    await maybeCommit(project.root, written);
  }

  const dev = devCommand(project.pkgManager);
  p.outro(
    [
      pico.green("All set.") +
        " Restart your dev server and try:",
      "",
      "  " + pico.cyan(`${dev}`),
      "  " + pico.cyan("curl http://localhost:3000/index.md"),
      "  " + pico.cyan("curl http://localhost:3000/llms.txt"),
      "",
      happyAgent(),
      "",
      pico.dim("Docs: https://github.com/yazinsai/site-md"),
    ].join("\n"),
  );
}

async function detect() {
  const spin = p.spinner();
  spin.start("Scanning your project");
  try {
    const info = detectProject(process.cwd());
    spin.stop(
      `${pico.green("✓")} Next.js ${pico.dim(info.nextVersion ?? "")} ${pico.dim("·")} ${
        info.useSrc ? "src/ layout" : "root layout"
      } ${pico.dim("·")} ${info.pkgManager}`,
    );
    return info;
  } catch (err) {
    spin.stop(pico.red("✗") + " " + (err as Error).message, 1);
    return null;
  }
}

async function askLlms(flags: Flags) {
  const title =
    flags.title ??
    (await p.text({
      message: "What's your site called?",
      placeholder: "My Site",
      defaultValue: "My Site",
    }));
  const description =
    flags.description ??
    (await p.text({
      message: "One-line description (for /llms.txt)",
      placeholder: "Public docs for AI agents",
      defaultValue: "Public docs for AI agents",
    }));
  return {
    title: (title as string) ?? "My Site",
    description: (description as string) ?? "Public docs for AI agents",
  };
}

function printHelp(): void {
  process.stdout.write(
    `
site-md — set up Markdown-for-agents in this Next.js app

Usage:
  npx site-md [options]

Options:
  --title <name>           Site title for /llms.txt
  --description <text>     Site description for /llms.txt
  -y, --yes                Skip confirmation prompt
  -h, --help               Show this help

Runs interactively by default. Pass --title and --description to skip prompts.

Docs: https://github.com/yazinsai/site-md
`,
  );
}

function planActions(project: ReturnType<typeof detectProject>): string[] {
  const lines: string[] = [];
  const render = (verb: string, path: string, purpose: string) =>
    `${verb} ${path}\n           ${pico.dim("↳ " + purpose)}`;

  lines.push(
    render(
      pico.cyan("install  "),
      `site-md via ${project.pkgManager}`,
      PURPOSE.install,
    ),
  );
  const relMiddleware = project.middlewarePath
    ? relative(project.root, project.middlewarePath)
    : relative(
        project.root,
        join(
          project.useSrc ? join(project.root, "src") : project.root,
          "middleware.ts",
        ),
      );
  lines.push(
    render(
      project.middlewarePath ? pico.yellow("merge    ") : pico.green("write    "),
      relMiddleware,
      PURPOSE.middleware,
    ),
  );
  const routeFile = join(project.routeDir, "route.ts");
  lines.push(
    render(
      pico.green("write    "),
      relative(project.root, routeFile),
      PURPOSE.route,
    ),
  );
  const cfgRel = project.configPath
    ? relative(project.root, project.configPath)
    : "next.config.mjs";
  lines.push(
    render(
      project.configPath ? pico.yellow("merge    ") : pico.green("write    "),
      cfgRel,
      PURPOSE.config,
    ),
  );
  return lines;
}

async function stepMiddleware(
  project: ReturnType<typeof detectProject>,
  written: string[],
): Promise<void> {
  const spin = p.spinner();
  const targetPath =
    project.middlewarePath ??
    join(
      project.useSrc ? join(project.root, "src") : project.root,
      "middleware.ts",
    );
  const rel = relative(project.root, targetPath);
  spin.start(
    project.middlewarePath
      ? `Merging ${rel}`
      : `Writing ${rel}`,
  );
  const existing = project.middlewarePath
    ? readFileSync(project.middlewarePath, "utf8")
    : null;
  const result = mergeMiddleware(existing);
  if (result.kind === "already-installed") {
    spin.stop(`${pico.dim("↷")} ${rel} ${pico.dim("(already has site-md)")}`);
    return;
  }
  if (result.kind === "unsupported") {
    spin.stop(pico.yellow("! ") + rel + pico.dim(" (skipped)"));
    p.log.warn(result.reason);
    p.log.info(
      `Add this by hand to ${rel}:\n` +
        pico.cyan(`export { proxy as middleware } from "site-md/proxy";`),
    );
    return;
  }
  writeFile(targetPath, result.source);
  written.push(targetPath);
  spin.stop(
    `${pico.green("✓")} ${result.kind === "fresh" ? "Wrote" : "Merged"} ${rel}\n   ${pico.dim("↳ " + PURPOSE.middleware)}`,
  );
}

async function stepRoute(
  project: ReturnType<typeof detectProject>,
  written: string[],
): Promise<void> {
  const spin = p.spinner();
  const targetPath = join(project.routeDir, "route.ts");
  const rel = relative(project.root, targetPath);
  spin.start(`Writing ${rel}`);
  writeFile(targetPath, ROUTE_FILE);
  written.push(targetPath);
  spin.stop(
    `${pico.green("✓")} Wrote ${rel}\n   ${pico.dim("↳ " + PURPOSE.route)}`,
  );
}

async function stepConfig(
  project: ReturnType<typeof detectProject>,
  opts: { title: string; description: string },
  written: string[],
): Promise<void> {
  const spin = p.spinner();
  if (!project.configPath) {
    const targetPath = join(project.root, "next.config.mjs");
    const rel = relative(project.root, targetPath);
    spin.start(`Writing ${rel}`);
    writeFile(targetPath, freshConfig("mjs", opts));
    written.push(targetPath);
    spin.stop(
      `${pico.green("✓")} Wrote ${rel}\n   ${pico.dim("↳ " + PURPOSE.config)}`,
    );
    return;
  }
  const rel = relative(project.root, project.configPath);
  spin.start(`Merging ${rel}`);
  const existing = readFileSync(project.configPath, "utf8");
  const ext = extname(project.configPath).replace(/^\./, "") as
    | "ts"
    | "mjs"
    | "js"
    | "cjs";
  const result = mergeConfig(existing, opts);
  if (result.kind === "already-wrapped") {
    spin.stop(`${pico.dim("↷")} ${rel} ${pico.dim("(already wrapped)")}`);
    return;
  }
  if (result.kind === "unsupported") {
    spin.stop(pico.yellow("! ") + rel + pico.dim(" (skipped)"));
    p.log.warn(result.reason);
    p.log.info(
      `Wrap your default export with ${pico.cyan("withNextMd(..., { llmsTxt: {...} })")}`,
    );
    return;
  }
  if (result.kind === "merged") {
    writeFile(project.configPath, result.source);
    written.push(project.configPath);
    spin.stop(
      `${pico.green("✓")} Merged ${rel}\n   ${pico.dim("↳ " + PURPOSE.config)}`,
    );
    return;
  }
  writeFile(project.configPath, freshConfig(ext === "cjs" ? "js" : ext, opts));
  written.push(project.configPath);
  spin.stop(
    `${pico.green("✓")} Wrote ${rel}\n   ${pico.dim("↳ " + PURPOSE.config)}`,
  );
}

function installedFiles(project: ReturnType<typeof detectProject>): string[] {
  const files = [join(project.root, "package.json")];
  const lockfile = {
    npm: "package-lock.json",
    pnpm: "pnpm-lock.yaml",
    yarn: "yarn.lock",
    bun: "bun.lockb",
  }[project.pkgManager];
  if (lockfile) {
    const path = join(project.root, lockfile);
    if (existsSync(path)) files.push(path);
    else if (project.pkgManager === "bun") {
      const alt = join(project.root, "bun.lock");
      if (existsSync(alt)) files.push(alt);
    }
  }
  return files.filter((f) => existsSync(f));
}

async function maybeCommit(root: string, written: string[]): Promise<void> {
  if (written.length === 0) return;
  if (!isGitRepo(root)) return;

  const doCommit = await p.confirm({
    message: "Commit these changes?",
    initialValue: true,
  });
  if (p.isCancel(doCommit) || !doCommit) return;

  const spin = p.spinner();
  spin.start("Creating commit");
  try {
    await git(root, ["add", "--", ...written]);
    await git(root, ["commit", "-m", "chore: set up site-md"]);
    spin.stop(`${pico.green("✓")} Committed ${written.length} file${written.length === 1 ? "" : "s"}`);
  } catch (err) {
    spin.stop(pico.yellow("! Commit skipped"), 1);
    p.log.warn((err as Error).message);
  }
}

function isGitRepo(root: string): boolean {
  return existsSync(join(root, ".git"));
}

function git(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args[0]} exited with code ${code}`));
    });
  });
}

function happyAgent(): string {
  const body = (s: string) => pico.bgYellow(pico.black(s));
  return [
    pico.dim("  your site is now agent-readable"),
    "",
    "     " + body("            "),
    "     " + body("   ●    ●   "),
    "     " + body("    ‿‿‿‿    ") + pico.dim("  ♥ .md"),
    "     " + body("            "),
  ].join("\n");
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function runInstall(
  project: ReturnType<typeof detectProject>,
): Promise<void> {
  const [cmd, ...args] = installCommand(project.pkgManager);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: project.root,
      stdio: "ignore",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function devCommand(pm: string): string {
  switch (pm) {
    case "pnpm":
      return "pnpm dev";
    case "yarn":
      return "yarn dev";
    case "bun":
      return "bun dev";
    default:
      return "npm run dev";
  }
}

main().catch((err) => {
  p.log.error((err as Error).stack ?? (err as Error).message);
  process.exit(1);
});
