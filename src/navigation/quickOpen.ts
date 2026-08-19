import * as vscode from 'vscode';
import * as path from 'node:path';

import { findThemeRoot } from '../core/theme.ts';
import { isOnDisk, themeRootFor } from '../config.ts';

interface TemplateItem extends vscode.QuickPickItem {
  uri?: vscode.Uri;
}

/** Acima disso, pular a contagem de linhas para o QuickPick abrir instantâneo. */
const LINE_COUNT_BUDGET = 200;

/** `bower_components` é o `node_modules` do front antigo, e nos repositórios de sites ele existe. */
const EXCLUDE = '{**/node_modules/**,**/bower_components/**}';

async function describe(uri: vscode.Uri, withLineCount: boolean): Promise<string> {
  if (!withLineCount) {
    return '';
  }
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const lines = Buffer.from(bytes).toString('utf8').split('\n').length;
    return `${lines} linhas`;
  } catch {
    return '';
  }
}

/** Raiz do tema do arquivo aberto, ou `undefined` fora de um tema. */
function activeThemeRoot(): string | undefined {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || !isOnDisk(document)) {
    return undefined;
  }
  return findThemeRoot(document.uri.fsPath, themeRootFor(document));
}

/** Nome do site dono da raiz: a pasta `html/` sozinha não diz de quem ela é. */
function themeLabel(root: string): string {
  const name = path.basename(root);
  return name.toLowerCase() === 'html' ? path.basename(path.dirname(root)) : name;
}

/** Caminho de `file` relativo a `root`, ou `undefined` se estiver fora dela. */
function insideRoot(root: string, file: string): string | undefined {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative
    : undefined;
}

/** Pasta que contém o arquivo, sempre com `/`. */
function folderOf(relativePath: string): string {
  return path.dirname(relativePath).replace(/\\/g, '/');
}

function group(byFolder: Map<string, vscode.Uri[]>, folder: string, uri: vscode.Uri): void {
  const list = byFolder.get(folder);
  if (list) {
    list.push(uri);
  } else {
    byFolder.set(folder, [uri]);
  }
}

function itemsOf(
  byFolder: Map<string, vscode.Uri[]>,
  descriptions: Map<string, string>,
): TemplateItem[] {
  const items: TemplateItem[] = [];
  for (const folder of [...byFolder.keys()].sort()) {
    items.push({ label: folder === '.' ? 'raiz' : folder, kind: vscode.QuickPickItemKind.Separator });
    const entries = byFolder.get(folder)!.sort((a, b) => a.path.localeCompare(b.path));
    for (const uri of entries) {
      items.push({
        label: path.basename(uri.fsPath),
        description: descriptions.get(uri.toString()) ?? '',
        detail: vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'),
        uri,
      });
    }
  }
  return items;
}

/**
 * Lista todos os `.template` do workspace, agrupados pela pasta que os contém.
 *
 * Substitui a navegação pelo explorer: no corpus são 27 arquivos espalhados por
 * `components/`, `helpers/`, `includes/` e a raiz do widget.
 *
 * Num repositório de sites o workspace tem dezenas de `<site>/html/` lado a
 * lado — mais de uma centena de arquivos, muitos deles homônimos (`index`,
 * `basket`). Por isso os do tema do arquivo aberto vêm primeiro, com o caminho
 * curto contado a partir da raiz dele; os demais seguem depois, identificados
 * pelo caminho completo dentro do workspace.
 */
export async function openTemplateQuickPick(): Promise<void> {
  const uris = await vscode.workspace.findFiles('**/*.template', EXCLUDE);
  if (uris.length === 0) {
    void vscode.window.showInformationMessage('Nenhum arquivo .template encontrado no workspace.');
    return;
  }

  const withLineCount = uris.length <= LINE_COUNT_BUDGET;
  const root = activeThemeRoot();

  const local = new Map<string, vscode.Uri[]>();
  const others = new Map<string, vscode.Uri[]>();
  for (const uri of uris) {
    const relative = root ? insideRoot(root, uri.fsPath) : undefined;
    if (relative !== undefined) {
      group(local, folderOf(relative), uri);
    } else {
      group(others, folderOf(vscode.workspace.asRelativePath(uri, false)), uri);
    }
  }

  // As leituras acontecem todas de uma vez: em série, 200 arquivos atrasariam a
  // abertura do QuickPick em uma ida ao disco cada.
  const descriptions = new Map(
    await Promise.all(
      uris.map(async (uri): Promise<[string, string]> => [uri.toString(), await describe(uri, withLineCount)]),
    ),
  );

  const items = [...itemsOf(local, descriptions), ...itemsOf(others, descriptions)];

  const picked = await vscode.window.showQuickPick(items, {
    title: root ? `Abrir template — ${themeLabel(root)}` : 'Abrir template',
    placeHolder: 'Digite parte do nome do arquivo',
    matchOnDescription: false,
    matchOnDetail: true,
  });

  if (picked?.uri) {
    const document = await vscode.workspace.openTextDocument(picked.uri);
    await vscode.window.showTextDocument(document);
  }
}
