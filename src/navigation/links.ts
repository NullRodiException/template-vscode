import * as vscode from 'vscode';

import { findPathReferences, type PathReference } from '../core/references.ts';
import { resolveIncludePath, resolveThemePath, resolveDeployPath } from '../core/theme.ts';
import { themeRootFor, sharedThemeRootFor, workspaceRootsFor } from '../config.ts';
import { LANGUAGE_ID } from '../format/provider.ts';

/**
 * Traduz uma referência para um arquivo no disco.
 *
 * Dois esquemas convivem no mesmo arquivo: `{% include %}` e `| themepath` usam o
 * caminho de fonte (idêntico à árvore local), enquanto `| contentpath` e o
 * argumento `template=` usam o caminho de deploy `Widgets/<folder>/…`, que só
 * resolve consultando o atributo `folder` do `manifest.xml`.
 */
function resolve(reference: PathReference, document: vscode.TextDocument): string | undefined {
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

const linkProvider: vscode.DocumentLinkProvider = {
  provideDocumentLinks(document) {
    const text = document.getText();
    const links: vscode.DocumentLink[] = [];

    for (const reference of findPathReferences(text)) {
      const target = resolve(reference, document);
      if (!target) {
        continue;
      }
      const range = new vscode.Range(
        document.positionAt(reference.start),
        document.positionAt(reference.end),
      );
      const link = new vscode.DocumentLink(range, vscode.Uri.file(target));
      link.tooltip = 'Abrir arquivo referenciado';
      links.push(link);
    }

    return links;
  },
};

export function registerLinks(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider({ language: LANGUAGE_ID }, linkProvider),
  );
}
