import * as t from "@babel/types";
import { addImport, hasImportFrom, parse, print } from "./ast";

export const FRESH_MIDDLEWARE = `export { proxy as middleware } from "site-md/proxy";

export const config = {
  matcher: [
    "/((?!api|_next|static|favicon.ico|.*\\\\.(?:js|css|json|xml|txt|map|webmanifest|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$).*)",
  ],
};
`;

export type MergeResult =
  | { kind: "fresh"; source: string }
  | { kind: "already-installed" }
  | { kind: "merged"; source: string }
  | { kind: "unsupported"; reason: string };

export function mergeMiddleware(existing: string | null): MergeResult {
  if (existing == null) return { kind: "fresh", source: FRESH_MIDDLEWARE };

  let ast: t.File;
  try {
    ast = parse(existing);
  } catch (err) {
    return {
      kind: "unsupported",
      reason: `Could not parse middleware file: ${(err as Error).message}`,
    };
  }

  if (hasImportFrom(ast, "site-md/proxy")) {
    return { kind: "already-installed" };
  }

  const body = ast.program.body;
  const middlewareInfo = findMiddlewareExport(body);

  if (middlewareInfo.kind === "none") {
    return {
      kind: "unsupported",
      reason:
        "Existing middleware.ts has no recognizable `middleware` export — please add site-md manually.",
    };
  }

  // Rename the user's middleware fn to __userMiddleware.
  renameMiddleware(body, middlewareInfo);

  // Inject import { proxy as __siteMdProxy } from "site-md/proxy"
  addImport(
    ast,
    t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier("__siteMdProxy"),
          t.identifier("proxy"),
        ),
      ],
      t.stringLiteral("site-md/proxy"),
    ),
  );

  // Append the composed middleware export.
  const composed = buildComposedMiddleware(middlewareInfo.isAsync);
  body.push(composed);

  return { kind: "merged", source: print(ast) };
}

type MiddlewareInfo =
  | { kind: "none" }
  | { kind: "fn-decl"; index: number; isAsync: boolean }
  | { kind: "var-decl"; index: number; isAsync: boolean };

function findMiddlewareExport(body: t.Statement[]): MiddlewareInfo {
  for (let i = 0; i < body.length; i++) {
    const node = body[i];
    if (!t.isExportNamedDeclaration(node)) continue;
    const decl = node.declaration;
    if (
      t.isFunctionDeclaration(decl) &&
      decl.id?.name === "middleware"
    ) {
      return { kind: "fn-decl", index: i, isAsync: decl.async };
    }
    if (t.isVariableDeclaration(decl)) {
      for (const v of decl.declarations) {
        if (t.isIdentifier(v.id) && v.id.name === "middleware") {
          const init = v.init;
          const isAsync =
            (t.isArrowFunctionExpression(init) ||
              t.isFunctionExpression(init)) &&
            init.async;
          return { kind: "var-decl", index: i, isAsync: !!isAsync };
        }
      }
    }
  }
  return { kind: "none" };
}

function renameMiddleware(body: t.Statement[], info: MiddlewareInfo): void {
  if (info.kind === "none") return;
  const exportNode = body[info.index] as t.ExportNamedDeclaration;
  const decl = exportNode.declaration;

  if (info.kind === "fn-decl" && t.isFunctionDeclaration(decl)) {
    decl.id = t.identifier("__userMiddleware");
    // Replace the export with the plain function declaration (un-export it).
    body[info.index] = decl;
    return;
  }
  if (info.kind === "var-decl" && t.isVariableDeclaration(decl)) {
    for (const v of decl.declarations) {
      if (t.isIdentifier(v.id) && v.id.name === "middleware") {
        v.id = t.identifier("__userMiddleware");
      }
    }
    body[info.index] = decl; // un-export
    return;
  }
}

function buildComposedMiddleware(userIsAsync: boolean): t.ExportNamedDeclaration {
  // const response = __siteMdProxy(request);
  // if (response) return response;
  // return __userMiddleware(request);
  const request = t.identifier("request");
  const responseId = t.identifier("response");

  const callProxy = t.variableDeclaration("const", [
    t.variableDeclarator(
      responseId,
      t.callExpression(t.identifier("__siteMdProxy"), [request]),
    ),
  ]);

  const ifReturn = t.ifStatement(
    responseId,
    t.returnStatement(responseId),
  );

  const callUser = t.callExpression(t.identifier("__userMiddleware"), [
    request,
  ]);
  const returnUser = t.returnStatement(
    userIsAsync ? t.awaitExpression(callUser) : callUser,
  );

  const fn = t.functionDeclaration(
    t.identifier("middleware"),
    [t.identifier("request")],
    t.blockStatement([callProxy, ifReturn, returnUser]),
    false,
    userIsAsync,
  );

  return t.exportNamedDeclaration(fn, []);
}
