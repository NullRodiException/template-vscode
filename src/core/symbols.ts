/**
 * Estrutura navegável de um `.template`, para o Outline e os breadcrumbs.
 *
 * O que serve de índice aqui não é a árvore HTML — ela não é balanceada — e sim
 * a convenção do projeto: cada arquivo carrega um ou mais `<template id="tpl-X">`
 * que o `Vue.component('X')` do `.js` irmão consome, e o Liquid de fora monta os
 * dados com `{% capture %}` e `{% assign %}`. Num `PageHeader.template` de 240
 * linhas é isso que a pessoa está procurando quando abre o Outline.
 *
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import { scan, regionAt, type Region } from './scanner.ts';

export type SymbolKind =
  /** `<template id="tpl-basket">` — a raiz de um componente Vue. */
  | 'component'
  /** `<script>` ou `<style>`. */
  | 'section'
  /** `{% capture nome %}`. */
  | 'capture'
  /** `{% assign nome = … %}`. */
  | 'assign';

export interface TemplateSymbol {
  kind: SymbolKind;
  name: string;
  /** Offset inicial do trecho que o símbolo representa. */
  start: number;
  end: number;
}

const COMPONENT_RE = /<template\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi;
const SECTION_RE = /<(script|style)\b[^>]*>/gi;
const CAPTURE_RE = /\{%-?\s*capture\s+(\w+)/g;
const ASSIGN_RE = /\{%-?\s*assign\s+(\w+)/g;

/**
 * Símbolos do documento, ordenados por posição.
 *
 * Ignora o que está dentro de `{% comment %}` — ali nada existe de verdade. O
 * que está dentro de `{% raw %}` **entra**: é justamente lá que moram os
 * `<template id="tpl-…">`, já que o corpo do componente é Vue.
 */
export function findSymbols(text: string, regions: Region[] = scan(text)): TemplateSymbol[] {
  const out: TemplateSymbol[] = [];

  const collect = (re: RegExp, kind: SymbolKind, label: (m: RegExpExecArray) => string): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (regionAt(regions, m.index)?.kind === 'liquid-comment') {
        continue;
      }
      out.push({ kind, name: label(m), start: m.index, end: m.index + m[0].length });
    }
  };

  collect(COMPONENT_RE, 'component', (m) => m[1]);
  collect(SECTION_RE, 'section', (m) => `<${m[1].toLowerCase()}>`);
  collect(CAPTURE_RE, 'capture', (m) => m[1]);
  collect(ASSIGN_RE, 'assign', (m) => m[1]);

  return out.sort((a, b) => a.start - b.start);
}
