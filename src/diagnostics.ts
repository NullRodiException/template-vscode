import * as vscode from 'vscode';

import { analyze, type Problem, type Severity } from './core/diagnostics.ts';
import { findPathReferences } from './core/references.ts';
import { resolveIncludePath } from './core/theme.ts';
import { LANGUAGE_ID } from './format/provider.ts';

const DEBOUNCE_MS = 300;

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

function toDiagnostic(document: vscode.TextDocument, problem: Problem): vscode.Diagnostic {
  const range = new vscode.Range(
    document.positionAt(problem.start),
    document.positionAt(problem.end),
  );
  const diagnostic = new vscode.Diagnostic(range, problem.message, SEVERITY[problem.severity]);
  diagnostic.source = 'linx-liquid';
  diagnostic.code = problem.code;
  return diagnostic;
}

/** `{% include %}` apontando para um arquivo que não existe na árvore. */
function checkMissingIncludes(document: vscode.TextDocument): vscode.Diagnostic[] {
  const themeRoot =
    vscode.workspace.getConfiguration('linxLiquid', document).get<string>('themeRoot', '').trim() ||
    undefined;

  const out: vscode.Diagnostic[] = [];
  for (const reference of findPathReferences(document.getText())) {
    if (reference.kind !== 'include') {
      continue;
    }
    if (resolveIncludePath(reference.path, document.uri.fsPath, themeRoot)) {
      continue;
    }
    const range = new vscode.Range(
      document.positionAt(reference.start),
      document.positionAt(reference.end),
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      `Não encontrei ${reference.path}.template a partir da raiz do tema. Se a raiz não for detectada corretamente, defina linxLiquid.themeRoot.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = 'linx-liquid';
    diagnostic.code = 'missing-include';
    out.push(diagnostic);
  }
  return out;
}

/** Converte `{% comment %}` inútil dentro de raw no `<!-- -->` que funciona ali. */
const quickFixProvider: vscode.CodeActionProvider = {
  provideCodeActions(document, _range, context) {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code !== 'comment-in-raw') {
        continue;
      }
      const text = document.getText();
      const openStart = document.offsetAt(diagnostic.range.start);
      const closeMatch = /\{%-?\s*endcomment\s*-?%\}/.exec(text.slice(openStart));
      if (!closeMatch) {
        continue;
      }

      const action = new vscode.CodeAction(
        'Converter para comentário HTML <!-- -->',
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      action.edit = new vscode.WorkspaceEdit();
      const closeStart = openStart + closeMatch.index;
      action.edit.replace(
        document.uri,
        new vscode.Range(
          document.positionAt(closeStart),
          document.positionAt(closeStart + closeMatch[0].length),
        ),
        '-->',
      );
      action.edit.replace(document.uri, diagnostic.range, '<!--');
      actions.push(action);
    }

    return actions;
  },
};

export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('linx-liquid');
  context.subscriptions.push(collection);

  const timers = new Map<string, NodeJS.Timeout>();

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId !== LANGUAGE_ID) {
      return;
    }
    const enabled = vscode.workspace
      .getConfiguration('linxLiquid', document)
      .get<boolean>('diagnostics.enabled', true);
    if (!enabled) {
      collection.delete(document.uri);
      return;
    }

    const problems = analyze(document.getText()).map((p) => toDiagnostic(document, p));
    collection.set(document.uri, [...problems, ...checkMissingIncludes(document)]);
  };

  const schedule = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(document);
      }, DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((d) => collection.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('linxLiquid')) {
        vscode.workspace.textDocuments.forEach(refresh);
      }
    }),
    vscode.languages.registerCodeActionsProvider({ language: LANGUAGE_ID }, quickFixProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );

  vscode.workspace.textDocuments.forEach(refresh);
}
