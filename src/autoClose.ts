/**
 * Fechamento automático de tag: digitar `>` em `<div` escreve `</div>` logo
 * adiante, com o cursor entre as duas.
 *
 * O VS Code faz isso só nas linguagens do serviço de HTML (`html.autoClosingTags`);
 * num id próprio como `linx-liquid` não vem nada, e a tag precisava ser fechada
 * na mão. Quem decide o que fechar é `closingTagFor`, em `core/` — aqui fica só
 * a parte que depende do editor.
 */

import * as vscode from 'vscode';

import { closingTagFor } from './core/htmlData.ts';
import { LANGUAGE_ID } from './format/provider.ts';

async function onDidChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
  const document = event.document;
  if (document.languageId !== LANGUAGE_ID || event.reason !== undefined) {
    return;
  }
  if (!vscode.workspace.getConfiguration('linxLiquid', document).get('autoClosingTags', true)) {
    return;
  }

  // Um `>` digitado, e nada mais: colar um trecho, aceitar uma sugestão que já
  // traz o fechamento ou editar em vários cursores não passa por aqui.
  const change = event.contentChanges[0];
  if (event.contentChanges.length !== 1 || change.text !== '>' || change.rangeLength !== 0) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document || !editor.selection.isEmpty) {
    return;
  }

  const position = document.positionAt(document.offsetAt(change.range.start) + 1);
  if (!editor.selection.active.isEqual(position)) {
    return;
  }

  const closing = closingTagFor(document.getText(), document.offsetAt(position));
  if (!closing) {
    return;
  }
  // `$0` antes do fechamento: o cursor fica dentro do elemento, pronto para o
  // conteúdo — que é o motivo de fechar sozinho.
  await editor.insertSnippet(new vscode.SnippetString(`$0${closing}`), position, {
    undoStopBefore: false,
    undoStopAfter: true,
  });
}

export function registerAutoCloseTags(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(onDidChange));
}
