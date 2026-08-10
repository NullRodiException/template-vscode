import * as vscode from 'vscode';

import { type PathReference } from '../core/references.ts';
import { resolveIncludePath, resolveThemePath, resolveDeployPath } from '../core/theme.ts';
import { themeRootFor, sharedThemeRootFor, workspaceRootsFor } from '../config.ts';

/**
 * Traduz uma referência para um arquivo no disco.
 *
 * Dois esquemas convivem no mesmo arquivo: `{% include %}` e `| themepath` usam o
 * caminho de fonte (idêntico à árvore local), enquanto `| contentpath` e o
 * argumento `template=` usam o caminho de deploy `Widgets/<folder>/…`, que só
 * resolve consultando o atributo `folder` do `manifest.xml`.
 *
 * Compartilhado pelos dois consumidores: os `DocumentLink` (Ctrl+Click) e o
 * `DefinitionProvider` (F12 e Peek), que precisam concordar sobre o destino.
 */
export function resolveReference(
  reference: PathReference,
  document: vscode.TextDocument,
): string | undefined {
  const file = document.uri.fsPath;
  const themeRoot = themeRootFor(document);
  const roots = workspaceRootsFor(document);

  switch (reference.kind) {
    case 'include':
      return resolveIncludePath(reference.path, file, themeRoot, roots);
    case 'theme':
      return resolveThemePath(reference.path, file, themeRoot);
    case 'deploy':
      return (
        resolveDeployPath(reference.path, file, themeRoot) ??
        // `template=` às vezes aparece com caminho de fonte.
        resolveIncludePath(reference.path, file, themeRoot, roots)
      );
    case 'shared': {
      // Sem a raiz do tema compartilhado configurada não há como resolver; um
      // link quebrado seria pior do que nenhum link.
      const sharedRoot = sharedThemeRootFor(document);
      return sharedRoot ? resolveThemePath(reference.path, file, sharedRoot) : undefined;
    }
    default:
      return undefined;
  }
}
