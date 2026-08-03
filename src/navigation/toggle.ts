import * as vscode from 'vscode';
import * as path from 'node:path';

import { findCounterpart } from '../core/theme.ts';

/**
 * Alterna entre `components/X.template` e `Scripts/components/X.js`.
 *
 * A convenção do projeto casa quatro nomes: o arquivo `.template`, o `.js`, o
 * `<template id="tpl-X">` e o `Vue.component('X')`. No corpus há 19 pares
 * completos, mais a exceção do `crediario.template`, cujo script mora na raiz de
 * `Scripts/` — coberta pelo fallback de `findCounterpart`.
 */
export async function toggleTemplateScript(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const current = editor.document.uri.fsPath;
  const counterpart = findCounterpart(current);

  if (!counterpart) {
    const name = path.basename(current);
    void vscode.window.showInformationMessage(
      `Não encontrei a contraparte de ${name}. A convenção esperada é components/X.template ↔ Scripts/components/X.js.`,
    );
    return;
  }

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(counterpart));
  await vscode.window.showTextDocument(document, { preview: false });
}
