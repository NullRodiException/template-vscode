/**
 * Faixas dobráveis de um `.template`.
 *
 * A dobra por indentação que o VS Code aplica sozinho não serve aqui: o corpo de
 * um `{% for %}` frequentemente **não** está indentado em relação à tag (o
 * indentador é tolerante, e 60% do corpus foi escrito à mão), e um `{% raw %}`
 * que envolve o arquivo inteiro dobraria tudo num nível só. Calcular as faixas a
 * partir da estrutura real — as mesmas tags que o scanner já reconhece — é o
 * único jeito de a dobra bater com o que o servidor enxerga.
 *
 * São três fontes de faixa: os blocos Liquid, as regiões do scanner
 * (`<script>`, `<style>`, comentário) e os elementos HTML emparelhados.
 *
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import { scan, type Region } from './scanner.ts';
import { analyzeBlocks } from './blocks.ts';
import { findHtmlTags } from './htmlTags.ts';
import { VOID_ELEMENTS } from './liquidTags.ts';

export type FoldKind =
  /** Bloco de código: `{% if %}`, `{% for %}`, `<script>`… */
  | 'code'
  /** Comentário HTML ou `{% comment %}`. */
  | 'comment';

export interface FoldRange {
  /** Primeira linha da faixa, 0-indexada. Continua visível quando dobrada. */
  start: number;
  /** Última linha escondida pela dobra, 0-indexada. */
  end: number;
  kind: FoldKind;
}

/** Offsets em que cada linha começa, para traduzir offset → número de linha. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

/** Linha 0-indexada que contém o offset. Busca binária. */
function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * Última linha a esconder, dado o offset onde o conteúdo termina.
 *
 * Quando o fechamento (`{% endif %}`, `</script>`, `-->`) é o primeiro token da
 * sua linha, essa linha fica de fora da dobra — é o comportamento do HTML no
 * VS Code, onde o `</div>` continua visível depois de dobrar.
 */
function lastHiddenLine(text: string, starts: number[], contentEnd: number): number {
  const line = lineOf(starts, contentEnd);
  const beforeOnLine = text.slice(starts[line], contentEnd);
  return beforeOnLine.trim() === '' ? line - 1 : line;
}

/**
 * Pares bloco/`end*` do Liquid ativo, incluindo `raw` e `comment` — que aqui
 * interessam justamente por serem os blocos mais longos do corpus, ainda que
 * sejam neutros para o indentador e para o diagnóstico.
 *
 * Aberturas sem fechamento são ignoradas: sem o `end*` não há como saber onde a
 * dobra terminaria. O diagnóstico é que reporta o desbalanceamento.
 */
function blockRanges(text: string, starts: number[], regions: Region[]): FoldRange[] {
  const { pairs } = analyzeBlocks(text, regions, { includeRawAndComment: true });
  const out: FoldRange[] = [];

  for (const pair of pairs) {
    const startLine = lineOf(starts, pair.open.start);
    const endLine = lastHiddenLine(text, starts, pair.close.start);
    if (endLine > startLine) {
      out.push({
        start: startLine,
        end: endLine,
        kind: pair.tag === 'comment' ? 'comment' : 'code',
      });
    }
  }

  return out;
}

/** `<script>`, `<style>` e comentários HTML, a partir das regiões do scanner. */
function regionRanges(text: string, starts: number[], regions: Region[]): FoldRange[] {
  const out: FoldRange[] = [];

  for (const region of regions) {
    if (region.kind !== 'script' && region.kind !== 'style' && region.kind !== 'html-comment') {
      continue;
    }
    const startLine = lineOf(starts, region.start);
    const endLine = lastHiddenLine(text, starts, region.end);
    if (endLine > startLine) {
      out.push({
        start: startLine,
        end: endLine,
        kind: region.kind === 'html-comment' ? 'comment' : 'code',
      });
    }
  }

  return out;
}

/**
 * Elementos cuja faixa já sai de `regionRanges`. Emparelhar a tag produziria a
 * mesma dobra uma segunda vez, e o corpo deles nem é marcação.
 */
const REGION_ELEMENTS = new Set(['script', 'style']);

/**
 * Quantos níveis olhar para trás atrás da abertura correspondente. É o mesmo
 * limite do indentador, e pela mesma razão: a árvore HTML destes arquivos não é
 * balanceada — `components/basket.template:119` tem um `</span>` órfão, e sem o
 * teto ele emparelharia com um `<span>` cinquenta linhas acima, criando uma
 * dobra que engole o arquivo.
 */
const POP_WINDOW = 3;

/**
 * Elementos HTML: `<div>` dobra até a linha antes do `</div>`.
 *
 * Void (`<br>`, `<img>`) e self-closing não abrem nada. Um fechamento sem
 * abertura à vista é ignorado, e uma abertura que nunca fecha simplesmente não
 * produz faixa — os dois casos são comuns aqui, onde os ramos de um `{% if %}`
 * abrem elementos diferentes (`components/register.template:73-101`).
 *
 * A pilha é só de HTML: um `<div>` aberto dentro de `{% if %}` e fechado depois
 * do `{% endif %}` emparelha. A faixa resultante cruza a do bloco Liquid, e o
 * VS Code descarta a que não aninha — melhor do que perder a dobra do elemento
 * em todo arquivo que usa esse padrão.
 */
function elementRanges(text: string, starts: number[], regions: Region[]): FoldRange[] {
  const out: FoldRange[] = [];
  const stack: { name: string; start: number }[] = [];

  for (const tag of findHtmlTags(text, regions)) {
    if (REGION_ELEMENTS.has(tag.name)) {
      continue;
    }

    if (tag.kind === 'open') {
      if (!tag.selfClosing && !VOID_ELEMENTS.has(tag.name)) {
        stack.push({ name: tag.name, start: tag.start });
      }
      continue;
    }

    const limit = Math.max(0, stack.length - POP_WINDOW);
    for (let i = stack.length - 1; i >= limit; i--) {
      if (stack[i].name !== tag.name) {
        continue;
      }
      const open = stack[i];
      // As aberturas puladas ficaram sem fechamento: descartadas junto.
      stack.length = i;
      const startLine = lineOf(starts, open.start);
      const endLine = lastHiddenLine(text, starts, tag.start);
      if (endLine > startLine) {
        out.push({ start: startLine, end: endLine, kind: 'code' });
      }
      break;
    }
  }

  return out;
}

/**
 * Todas as faixas dobráveis do documento, ordenadas pela linha inicial.
 *
 * Faixas duplicadas — a mesma linha de início e de fim vindas do bloco e da
 * região — são colapsadas numa só, para não gerar duas setas na mesma linha.
 */
export function computeFoldRanges(text: string, regions: Region[] = scan(text)): FoldRange[] {
  const starts = lineStarts(text);
  const all = [
    ...blockRanges(text, starts, regions),
    ...regionRanges(text, starts, regions),
    ...elementRanges(text, starts, regions),
  ];

  const seen = new Set<string>();
  return all
    .filter((range) => {
      const key = `${range.start}:${range.end}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
