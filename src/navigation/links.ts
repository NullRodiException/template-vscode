import * as vscode from 'vscode';

import { findPathReferences } from '../core/references.ts';
import { resolveReference } from './resolveReference.ts';
import { regionsOf } from '../regionCache.ts';
import { isOnDisk } from '../config.ts';
import { LANGUAGE_ID } from '../format/provider.ts';

const linkProvider: vscode.DocumentLinkProvider = {
  provideDocumentLinks(document) {
    if (!isOnDisk(document)) {
      return [];
    }
    const links: vscode.DocumentLink[] = [];

    for (const reference of findPathReferences(document.getText(), regionsOf(document))) {
      const target = resolveReference(reference, document);
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

/**
 * F12 e Peek Definition sobre o caminho de um `{% include %}`, de um
 * `template="…"` ou de um `| themepath`.
 *
 * O `DocumentLink` acima só atende Ctrl+Click; sem isto, F12 não faz nada e o
 * Peek não abre — que é como a maioria das pessoas navega.
 */
const definitionProvider: vscode.DefinitionProvider = {
  provideDefinition(document, position) {
    if (!isOnDisk(document)) {
      return undefined;
    }
    const offset = document.offsetAt(position);

    for (const reference of findPathReferences(document.getText(), regionsOf(document))) {
      if (offset < reference.start || offset > reference.end) {
        continue;
      }
      const target = resolveReference(reference, document);
      if (!target) {
        return undefined;
      }
      return new vscode.Location(vscode.Uri.file(target), new vscode.Position(0, 0));
    }

    return undefined;
  },
};

export function registerLinks(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider({ language: LANGUAGE_ID }, linkProvider),
    vscode.languages.registerDefinitionProvider({ language: LANGUAGE_ID }, definitionProvider),
  );
}
