/**
 * Leitura das configurações da extensão e das pastas do workspace.
 *
 * Fica fora de `src/core/`, que é deliberadamente livre de `vscode` para poder
 * rodar sob `node --test`.
 */

import * as vscode from 'vscode';

function setting(document: vscode.TextDocument, key: string): string | undefined {
  const value = vscode.workspace.getConfiguration('linxLiquid', document).get<string>(key, '');
  return value.trim() === '' ? undefined : value;
}

/** `linxLiquid.themeRoot`, ou `undefined` para detectar automaticamente. */
export function themeRootFor(document: vscode.TextDocument): string | undefined {
  return setting(document, 'themeRoot');
}

/** `linxLiquid.sharedThemeRoot`, ou `undefined` se não configurado. */
export function sharedThemeRootFor(document: vscode.TextDocument): string | undefined {
  return setting(document, 'sharedThemeRoot');
}

/**
 * Pastas do workspace usadas para resolver includes quando não há raiz de tema.
 *
 * A pasta dona do arquivo vem primeiro; as demais entram como fallback para
 * workspaces multi-root, onde o include pode apontar para outra pasta.
 */
export function workspaceRootsFor(document: vscode.TextDocument): string[] {
  const all = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  const owner = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  if (!owner) {
    return all;
  }
  return [owner, ...all.filter((root) => root !== owner)];
}
