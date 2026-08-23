/**
 * Leitura das configurações da extensão e das pastas do workspace.
 *
 * Fica fora de `src/core/`, que é deliberadamente livre de `vscode` para poder
 * rodar sob `node --test`.
 */

import * as vscode from 'vscode';

/**
 * `true` quando o documento tem um arquivo real por trás.
 *
 * Resolver caminho, procurar `manifest.xml` e checar existência de include só
 * fazem sentido aí. Num `untitled:` ou num documento de outro provedor, o
 * `fsPath` é um caminho inventado que resolveria contra a pasta errada.
 */
export function isOnDisk(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file';
}

/**
 * O escopo é um documento aberto ou apenas a `Uri` de um arquivo: um comando
 * disparado pelo menu do explorer age sobre um arquivo que ninguém abriu, e a
 * configuração pode ser por pasta num workspace multi-root.
 */
type Scope = vscode.TextDocument | vscode.Uri;

function setting(scope: Scope, key: string): string | undefined {
  const value = vscode.workspace.getConfiguration('linxLiquid', scope).get<string>(key, '');
  return value.trim() === '' ? undefined : value;
}

/** `linxLiquid.themeRoot`, ou `undefined` para detectar automaticamente. */
export function themeRootFor(scope: Scope): string | undefined {
  return setting(scope, 'themeRoot');
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
