/**
 * Leitura das configurações da extensão e das pastas do workspace.
 *
 * Fica fora de `src/core/`, que é deliberadamente livre de `vscode` para poder
 * rodar sob `node --test`.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';

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

/**
 * Só o `TextDocument` tem `.uri`; a `Uri` é ela mesma. A checagem é por
 * propriedade, e não `instanceof vscode.Uri`, porque o teste do bundle carrega
 * a extensão com um stub de `vscode` onde `Uri` não é uma classe de verdade.
 */
function uriOf(scope: Scope): vscode.Uri {
  return 'uri' in scope ? scope.uri : scope;
}

function setting(scope: Scope, key: string): string | undefined {
  const value = vscode.workspace.getConfiguration('linxLiquid', scope).get<string>(key, '');
  return value.trim() === '' ? undefined : value;
}

/**
 * Caminho configurado, já absoluto.
 *
 * O manifesto promete que um valor relativo conta da pasta do workspace, mas
 * quem recebia o valor cru chamava `path.resolve`, que conta do diretório de
 * trabalho do processo — no Extension Host, a pasta de instalação do VS Code.
 * Um `themeRoot: "Base"` resolvia para dentro do editor e não achava nada.
 */
function pathSetting(scope: Scope, key: string): string | undefined {
  const value = setting(scope, key);
  if (value === undefined || path.isAbsolute(value)) {
    return value;
  }
  const owner = vscode.workspace.getWorkspaceFolder(uriOf(scope))?.uri.fsPath;
  return owner ? path.join(owner, value) : value;
}

/** `linxLiquid.themeRoot`, ou `undefined` para detectar automaticamente. */
export function themeRootFor(scope: Scope): string | undefined {
  return pathSetting(scope, 'themeRoot');
}

/** `linxLiquid.sharedThemeRoot`, ou `undefined` se não configurado. */
export function sharedThemeRootFor(document: vscode.TextDocument): string | undefined {
  return pathSetting(document, 'sharedThemeRoot');
}

/**
 * Pastas do workspace, usadas para resolver includes quando não há raiz de tema
 * e como fronteira da detecção automática da raiz.
 *
 * A pasta dona do arquivo vem primeiro; as demais entram como fallback para
 * workspaces multi-root, onde o include pode apontar para outra pasta.
 */
export function workspaceRootsFor(scope: Scope): string[] {
  const all = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  const owner = vscode.workspace.getWorkspaceFolder(uriOf(scope))?.uri.fsPath;
  if (!owner) {
    return all;
  }
  return [owner, ...all.filter((root) => root !== owner)];
}
