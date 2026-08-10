/**
 * Adaptador entre o `TextDocument` do editor e o cache puro de `core/`.
 *
 * Fica fora de `src/core/`, que é deliberadamente livre de `vscode` para poder
 * rodar sob `node --test`.
 */

import * as vscode from 'vscode';

import { createRegionCache } from './core/regionCache.ts';
import { type Region } from './core/scanner.ts';

const cache = createRegionCache();

/** Regiões do documento, reaproveitadas enquanto a versão dele não mudar. */
export function regionsOf(document: vscode.TextDocument): Region[] {
  return cache.regions({
    key: document.uri.toString(),
    version: document.version,
    text: document.getText(),
  });
}

export function clearRegionCache(): void {
  cache.clear();
}
