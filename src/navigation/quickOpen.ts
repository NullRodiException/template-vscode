import * as vscode from 'vscode';
import * as path from 'node:path';

interface TemplateItem extends vscode.QuickPickItem {
  uri?: vscode.Uri;
}

/** Acima disso, pular a contagem de linhas para o QuickPick abrir instantâneo. */
const LINE_COUNT_BUDGET = 200;

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

/**
 * Lista todos os `.template` do workspace, agrupados pela pasta que os contém.
 *
 * Substitui a navegação pelo explorer: no corpus são 27 arquivos espalhados por
 * `components/`, `helpers/`, `includes/` e a raiz do widget.
 */
export async function openTemplateQuickPick(): Promise<void> {
  const uris = await vscode.workspace.findFiles('**/*.template', '**/node_modules/**');
  if (uris.length === 0) {
    void vscode.window.showInformationMessage('Nenhum arquivo .template encontrado no workspace.');
    return;
  }

  const withLineCount = uris.length <= LINE_COUNT_BUDGET;

  const byFolder = new Map<string, vscode.Uri[]>();
  for (const uri of uris) {
    const relative = vscode.workspace.asRelativePath(uri, false);
    const folder = path.dirname(relative).replace(/\\/g, '/');
    const list = byFolder.get(folder);
    if (list) {
      list.push(uri);
    } else {
      byFolder.set(folder, [uri]);
    }
  }

  // As leituras acontecem todas de uma vez: em série, 200 arquivos atrasariam a
  // abertura do QuickPick em uma ida ao disco cada.
  const descriptions = new Map(
    await Promise.all(
      uris.map(async (uri): Promise<[string, string]> => [uri.toString(), await describe(uri, withLineCount)]),
    ),
  );

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

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Abrir template',
    placeHolder: 'Digite parte do nome do arquivo',
    matchOnDescription: false,
    matchOnDetail: true,
  });

  if (picked?.uri) {
    const document = await vscode.workspace.openTextDocument(picked.uri);
    await vscode.window.showTextDocument(document);
  }
}
