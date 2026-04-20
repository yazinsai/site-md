import * as t from "@babel/types";
import { addImport, hasImportFrom, parse, print } from "./ast";

export interface LlmsTxtOpts {
  title?: string;
  description?: string;
}

export type ConfigMergeResult =
  | { kind: "fresh"; source: string }
  | { kind: "already-wrapped" }
  | { kind: "merged"; source: string }
  | { kind: "unsupported"; reason: string };

export function freshConfig(
  ext: "ts" | "mjs" | "js",
  opts: LlmsTxtOpts,
): string {
  const llmsTxtBlock = buildLlmsTxtText(opts);
  if (ext === "js") {
    return `const { withNextMd } = require("site-md/config");

module.exports = withNextMd(
  {},
${llmsTxtBlock},
);
`;
  }
  return `import { withNextMd } from "site-md/config";

export default withNextMd(
  {},
${llmsTxtBlock},
);
`;
}

function buildLlmsTxtText(opts: LlmsTxtOpts): string {
  const title = opts.title ?? "My Site";
  const description = opts.description ?? "Public docs for AI agents";
  return `  {
    llmsTxt: {
      title: ${JSON.stringify(title)},
      description: ${JSON.stringify(description)},
    },
  }`;
}

export function mergeConfig(
  existing: string,
  opts: LlmsTxtOpts,
): ConfigMergeResult {
  let ast: t.File;
  try {
    ast = parse(existing);
  } catch (err) {
    return {
      kind: "unsupported",
      reason: `Could not parse next.config: ${(err as Error).message}`,
    };
  }

  if (hasImportFrom(ast, "site-md/config")) {
    return { kind: "already-wrapped" };
  }
  if (hasSiteMdRequire(ast)) {
    return { kind: "already-wrapped" };
  }

  const body = ast.program.body;
  const isEsm = isEsmFile(ast);

  const optsExpr = buildLlmsTxtObjectExpr(opts);

  if (isEsm) {
    const defaultExportIdx = body.findIndex((n) =>
      t.isExportDefaultDeclaration(n),
    );
    if (defaultExportIdx === -1) {
      return {
        kind: "unsupported",
        reason:
          "next.config has no `export default` — add the wrap by hand.",
      };
    }
    const exportNode = body[defaultExportIdx] as t.ExportDefaultDeclaration;
    const inner = toExpression(exportNode.declaration);
    if (!inner) {
      return {
        kind: "unsupported",
        reason:
          "next.config has an unusual `export default` — add the wrap by hand.",
      };
    }
    exportNode.declaration = t.callExpression(
      t.identifier("withNextMd"),
      [inner, optsExpr],
    );
    addImport(
      ast,
      t.importDeclaration(
        [t.importSpecifier(t.identifier("withNextMd"), t.identifier("withNextMd"))],
        t.stringLiteral("site-md/config"),
      ),
    );
    return { kind: "merged", source: print(ast) };
  }

  // CJS: module.exports = <expr>
  const meIdx = findModuleExportsIdx(body);
  if (meIdx === -1) {
    return {
      kind: "unsupported",
      reason:
        "next.config has no `module.exports =` — add the wrap by hand.",
    };
  }
  const exprStmt = body[meIdx] as t.ExpressionStatement;
  const assign = exprStmt.expression as t.AssignmentExpression;
  assign.right = t.callExpression(t.identifier("withNextMd"), [
    assign.right,
    optsExpr,
  ]);
  // Add `const { withNextMd } = require("site-md/config");`
  const requireDecl = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.objectPattern([
        t.objectProperty(
          t.identifier("withNextMd"),
          t.identifier("withNextMd"),
          false,
          true,
        ),
      ]),
      t.callExpression(t.identifier("require"), [
        t.stringLiteral("site-md/config"),
      ]),
    ),
  ]);
  body.unshift(requireDecl);
  return { kind: "merged", source: print(ast) };
}

function buildLlmsTxtObjectExpr(opts: LlmsTxtOpts): t.ObjectExpression {
  const title = opts.title ?? "My Site";
  const description = opts.description ?? "Public docs for AI agents";
  return t.objectExpression([
    t.objectProperty(
      t.identifier("llmsTxt"),
      t.objectExpression([
        t.objectProperty(t.identifier("title"), t.stringLiteral(title)),
        t.objectProperty(
          t.identifier("description"),
          t.stringLiteral(description),
        ),
      ]),
    ),
  ]);
}

function toExpression(
  decl: t.ExportDefaultDeclaration["declaration"],
): t.Expression | null {
  if (t.isExpression(decl)) return decl;
  // Unusual: export default function() {} or class — wrap as call to it.
  if (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) {
    return null;
  }
  return null;
}

function isEsmFile(ast: t.File): boolean {
  for (const node of ast.program.body) {
    if (
      t.isExportDefaultDeclaration(node) ||
      t.isExportNamedDeclaration(node) ||
      t.isImportDeclaration(node)
    ) {
      return true;
    }
  }
  return false;
}

function findModuleExportsIdx(body: t.Statement[]): number {
  for (let i = 0; i < body.length; i++) {
    const node = body[i];
    if (!t.isExpressionStatement(node)) continue;
    const expr = node.expression;
    if (!t.isAssignmentExpression(expr)) continue;
    const left = expr.left;
    if (
      t.isMemberExpression(left) &&
      t.isIdentifier(left.object, { name: "module" }) &&
      t.isIdentifier(left.property, { name: "exports" })
    ) {
      return i;
    }
  }
  return -1;
}

function hasSiteMdRequire(ast: t.File): boolean {
  for (const node of ast.program.body) {
    if (!t.isVariableDeclaration(node)) continue;
    for (const v of node.declarations) {
      const init = v.init;
      if (
        t.isCallExpression(init) &&
        t.isIdentifier(init.callee, { name: "require" }) &&
        init.arguments[0] &&
        t.isStringLiteral(init.arguments[0]) &&
        init.arguments[0].value === "site-md/config"
      ) {
        return true;
      }
    }
  }
  return false;
}
