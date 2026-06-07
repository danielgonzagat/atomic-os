/**
 * Universal (multi-language) import insertion — the tree-sitter counterpart of
 * the ts-morph add_import, so a dependency can be added to ALL grammar-backed
 * languages that have an import concept, not just TS/JS. Line-based + CST-anchored:
 * it places the statement after the last REAL import node (tree-sitter, so an
 * `import` inside a string is never matched) or after the package/shebang header.
 */
import { astNodes } from './native-bridge.js';
import { validate } from './engine.js';
import { extToGrammar } from './engine-universal.js';
import type { SemanticEditResult } from './advanced-imports.js';

/** Node types that represent an import/include statement, per grammar. */
const IMPORT_TYPES: Record<string, Set<string>> = {
  python: new Set(['import_statement', 'import_from_statement']),
  go: new Set(['import_declaration']),
  ruby: new Set(['call']),
  rust: new Set(['use_declaration']),
  java: new Set(['import_declaration']),
  c: new Set(['preproc_include']),
  cpp: new Set(['preproc_include']),
  bash: new Set(['command']),
};

/** Build the language-specific import statement; null when the language has no import concept. */
function buildImportStatement(grammar: string, moduleSpecifier: string, name: string, alias?: string): string | null {
  const local = alias && alias.length ? alias : name;
  switch (grammar) {
    case 'python':
      return name ? `from ${moduleSpecifier} import ${name}${alias ? ` as ${alias}` : ''}` : `import ${moduleSpecifier}`;
    case 'rust':
      return name ? `use ${moduleSpecifier}::${name}${alias ? ` as ${alias}` : ''};` : `use ${moduleSpecifier};`;
    case 'java':
      return name ? `import ${moduleSpecifier}.${name};` : `import ${moduleSpecifier};`;
    case 'go':
      return local ? `import ${local} "${moduleSpecifier}"` : `import "${moduleSpecifier}"`;
    case 'ruby':
      return `require '${moduleSpecifier}'`;
    case 'c':
    case 'cpp':
      return /[<"]/.test(moduleSpecifier) || moduleSpecifier.includes('/') || moduleSpecifier.endsWith('.h')
        ? `#include "${moduleSpecifier}"`
        : `#include <${moduleSpecifier}>`;
    case 'bash':
      return `source ${moduleSpecifier}`;
    default:
      return null;
  }
}

export async function universalAddImport(
  file: string,
  original: string,
  moduleSpecifier: string,
  name: string,
  alias: string | undefined,
  ext: string,
): Promise<SemanticEditResult> {
  const grammar = extToGrammar(ext);
  if (!grammar || ['json', 'javascript', 'typescript', 'tsx'].includes(grammar)) {
    throw new Error(`add_import: no universal import for ${ext || '(none)'} (TS/JS go through ts-morph; JSON has no imports)`);
  }
  const stmt = buildImportStatement(grammar, moduleSpecifier, name, alias);
  if (stmt === null) throw new Error(`add_import: imports are not a concept in ${grammar}`);

  const lines = original.split('\n');
  if (lines.some((l) => l.trim() === stmt.trim())) {
    return { newText: original, validation: validate(file, original, original), detail: { action: 'already-present', moduleSpecifier, name, method: 'cst-correct' } };
  }

  // Find existing import nodes (CST-correct), filtering the broad ruby/bash node types.
  const types = IMPORT_TYPES[grammar];
  const nodes = types ? await astNodes(original, grammar, types) : null;
  const realImports = (nodes ?? []).filter((n) => {
    if (grammar === 'ruby') return /^\s*require(_relative)?\b/.test(n.text);
    if (grammar === 'bash') return /^\s*(source|\.)\s/.test(n.text);
    return true;
  });

  let insertIdx: number;
  if (realImports.length) {
    let maxEnd = 0;
    for (const n of realImports) {
      const end = n.line + n.text.split('\n').length - 1; // 1-based last line of the import
      if (end > maxEnd) maxEnd = end;
    }
    insertIdx = maxEnd; // 0-based index = insert right after the 1-based last import line
  } else if ((grammar === 'go' || grammar === 'java')) {
    const pkgIdx = lines.findIndex((l) => /^\s*package\b/.test(l));
    insertIdx = pkgIdx >= 0 ? pkgIdx + 1 : 0;
    if (pkgIdx >= 0) lines.splice(insertIdx, 0, ''); // blank line after package
    if (pkgIdx >= 0) insertIdx += 1;
  } else if (lines[0]?.startsWith('#!')) {
    insertIdx = 1;
  } else {
    insertIdx = 0;
  }

  lines.splice(insertIdx, 0, stmt);
  const newText = lines.join('\n');
  return {
    newText,
    validation: validate(file, original, newText),
    detail: { action: realImports.length ? 'added-specifier' : 'created-declaration', moduleSpecifier, name, method: 'cst-correct' },
  };
}

/** Remove the import of `moduleSpecifier` (matching `name` when given) for any grammar-backed language. */
export async function universalRemoveImport(
  file: string,
  original: string,
  moduleSpecifier: string,
  name: string,
  ext: string,
): Promise<SemanticEditResult> {
  const grammar = extToGrammar(ext);
  if (!grammar || ['json', 'javascript', 'typescript', 'tsx'].includes(grammar)) {
    throw new Error(`remove_import: no universal import for ${ext || '(none)'} (TS/JS go through ts-morph; JSON has no imports)`);
  }
  const lines = original.split('\n');
  const isImportLine = (t: string): boolean =>
    /^(import|from|use|require(_relative)?|#include|source)\b/.test(t) && t.includes(moduleSpecifier) && (!name || t.includes(name));
  const idx = lines.findIndex((l) => isImportLine(l.trim()));
  if (idx < 0) {
    return { newText: original, validation: validate(file, original, original), detail: { action: 'not-present', moduleSpecifier, name, method: 'cst-correct' } };
  }
  lines.splice(idx, 1);
  const newText = lines.join('\n');
  return { newText, validation: validate(file, original, newText), detail: { action: 'removed', moduleSpecifier, name, method: 'cst-correct' } };
}
