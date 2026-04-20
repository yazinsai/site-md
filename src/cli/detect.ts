import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface ProjectInfo {
  root: string;
  pkgManager: PackageManager;
  useSrc: boolean;
  nextVersion: string | null;
  middlewarePath: string | null;
  configPath: string | null;
  routeDir: string;
}

export function detectProject(cwd: string): ProjectInfo {
  const root = cwd;
  const pkgJsonPath = join(root, "package.json");
  if (!existsSync(pkgJsonPath)) {
    throw new Error(
      `No package.json found in ${root}. Run this inside a Next.js project.`,
    );
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const nextVersion =
    pkg.dependencies?.next ?? pkg.devDependencies?.next ?? null;
  if (!nextVersion) {
    throw new Error(
      "This doesn't look like a Next.js project (next is not in dependencies).",
    );
  }

  const useSrc = existsSync(join(root, "src", "app"));
  const pkgManager = detectPackageManager(root);

  const base = useSrc ? join(root, "src") : root;
  const middlewarePath = findExisting([
    join(base, "middleware.ts"),
    join(base, "middleware.js"),
    join(base, "middleware.mjs"),
  ]);
  const configPath = findExisting([
    join(root, "next.config.ts"),
    join(root, "next.config.mjs"),
    join(root, "next.config.js"),
    join(root, "next.config.cjs"),
  ]);
  const routeDir = join(base, "app", "api", "site-md", "[...path]");

  return {
    root,
    pkgManager,
    useSrc,
    nextVersion,
    middlewarePath,
    configPath,
    routeDir,
  };
}

function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

function findExisting(paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) ?? null;
}

export function installCommand(pm: PackageManager): string[] {
  switch (pm) {
    case "pnpm":
      return ["pnpm", "add", "site-md"];
    case "yarn":
      return ["yarn", "add", "site-md"];
    case "bun":
      return ["bun", "add", "site-md"];
    default:
      return ["npm", "install", "site-md"];
  }
}
