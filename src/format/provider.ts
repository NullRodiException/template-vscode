import * as vscode from 'vscode';

import { computeIndentation, type IndentOptions, type IndentEdit } from './indenter.ts';

export const LANGUAGE_ID = 'linx-liquid';

function readOptions(document: vscode.TextDocument, options: vscode.FormattingOptions): IndentOptions {
  const config = vscode.workspace.getConfiguration('linxLiquid', document);
  return {
    // `insertSpaces`/`tabSize` já vêm resolvidos pelo editor, respeitando
    // `editor.detectIndentation` — é o que faz cada arquivo do corpus manter o
    // próprio estilo, num projeto onde 60% usa tab e 40% usa espaço.
    insertSpaces: options.insertSpaces,
    tabSize: options.tabSize,
    attributeIndent: config.get<'oneLevel' | 'preserve'>('format.attributeIndent', 'oneLevel'),
  };
}

/**
 * Converte para `TextEdit` mantendo a garantia do indentador: o range vai de
 * zero até o primeiro caractere não-branco, e nada além disso é tocado.
 */
function toTextEdits(edits: IndentEdit[]): vscode.TextEdit[] {
  return edits.map((edit) =>
    vscode.TextEdit.replace(
      new vscode.Range(edit.line, 0, edit.line, edit.oldIndentLength),
      edit.newIndent,
    ),
  );
}

const documentFormatter: vscode.DocumentFormattingEditProvider = {
  provideDocumentFormattingEdits(document, options) {
    const edits = computeIndentation(document.getText(), readOptions(document, options));
    return toTextEdits(edits);
  },
};

const rangeFormatter: vscode.DocumentRangeFormattingEditProvider = {
  provideDocumentRangeFormattingEdits(document, range, options) {
    // A indentação de uma linha depende de tudo que veio antes dela, então o
    // cálculo roda sobre o documento inteiro e só o resultado é recortado.
    const all = computeIndentation(document.getText(), readOptions(document, options));
    const inRange = all.filter((e) => e.line >= range.start.line && e.line <= range.end.line);
    return toTextEdits(inRange);
  },
};

export function registerFormatting(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, documentFormatter),
    vscode.languages.registerDocumentRangeFormattingEditProvider(LANGUAGE_ID, rangeFormatter),
  );
}
