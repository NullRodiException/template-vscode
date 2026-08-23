import * as vscode from 'vscode';
import * as path from 'node:path';

import { findThemeRoot, toIncludePath } from '../core/theme.ts';
import { themeRootFor } from '../config.ts';

/**
 * Raiz de onde o caminho do include conta.
 *
 * A do tema primeiro — a pasta que contém `Pages/`, ou a `<site>/html/`. Fora
 * de um tema Linx vale a pasta do workspace, que é a mesma raiz que
 * `resolveIncludePath` usa de fallback: assim o caminho copiado é exatamente o
 * que o Ctrl+Click vai conseguir abrir depois.
 */
function includeRoot(uri: vscode.Uri): string | undefined {
  return (
    findThemeRoot(uri.fsPath, themeRootFor(uri)) ??
    vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath
  );
}

/**
 * Arquivos sobre os quais o comando age.
 *
 * O menu do explorer manda o item clicado e, quando há seleção múltipla, a
 * lista inteira — que tem prioridade. Pela paleta não vem argumento nenhum, e
 * aí o alvo é o arquivo aberto.
 */
function targets(clicked?: vscode.Uri, selected?: vscode.Uri[]): vscode.Uri[] {
  const uris = selected?.length ? selected : clicked ? [clicked] : [];
  if (uris.length > 0) {
    return uris.filter((uri) => uri.scheme === 'file');
  }
  const active = vscode.window.activeTextEditor?.document;
  return active && active.uri.scheme === 'file' ? [active.uri] : [];
}

/**
 * Copia o `{% include %}` que aponta para o arquivo.
 *
 * `<site>/html/components/index.template` vira `{% include /components/index %}`.
 * É o caminho que sempre se monta à mão ao reaproveitar um componente, e errar
 * a raiz ou deixar o `.template` no fim só aparece na hora que a página abre
 * sem o trecho.
 */
export async function copyInclude(clicked?: vscode.Uri, selected?: vscode.Uri[]): Promise<void> {
  const files = targets(clicked, selected);
  if (files.length === 0) {
    void vscode.window.showWarningMessage(
      'Abra um .template ou selecione um no explorer para copiar o include.',
    );
    return;
  }

  const includes: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const root = includeRoot(file);
    const includePath = root ? toIncludePath(file.fsPath, root) : undefined;
    if (includePath) {
      includes.push(`{% include ${includePath} %}`);
    } else {
      skipped.push(path.basename(file.fsPath));
    }
  }

  if (includes.length === 0) {
    void vscode.window.showWarningMessage(
      `Não deu para montar o include de ${skipped.join(', ')}: o arquivo precisa ser um .template dentro da raiz do tema. Se a detecção falhou, defina linxLiquid.themeRoot.`,
    );
    return;
  }

  await vscode.env.clipboard.writeText(includes.join('\n'));

  const copied =
    includes.length === 1 ? `Copiado: ${includes[0]}` : `${includes.length} includes copiados.`;
  void vscode.window.showInformationMessage(
    skipped.length === 0 ? copied : `${copied} Fora da raiz do tema: ${skipped.join(', ')}.`,
  );
}
