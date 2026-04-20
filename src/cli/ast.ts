import * as recast from "recast";
import babelTsParser from "recast/parsers/babel-ts.js";
import * as t from "@babel/types";

export function parse(source: string): t.File {
  return recast.parse(source, { parser: babelTsParser }) as unknown as t.File;
}

export function print(ast: t.File): string {
  return recast.print(ast as any, { quote: "double" }).code;
}

export function hasImportFrom(ast: t.File, source: string): boolean {
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value === source) {
      return true;
    }
    if (
      t.isExportNamedDeclaration(node) &&
      node.source &&
      node.source.value === source
    ) {
      return true;
    }
    if (
      t.isExportAllDeclaration(node) &&
      node.source.value === source
    ) {
      return true;
    }
  }
  return false;
}

export function addImport(ast: t.File, decl: t.ImportDeclaration): void {
  const body = ast.program.body;
  let lastImportIdx = -1;
  for (let i = 0; i < body.length; i++) {
    if (t.isImportDeclaration(body[i])) lastImportIdx = i;
  }
  body.splice(lastImportIdx + 1, 0, decl);
}
