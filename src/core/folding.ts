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
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import { scan, type Region } from './scanner.ts';
import { analyzeBlocks } from './blocks.ts';

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
 * Todas as faixas dobráveis do documento, ordenadas pela linha inicial.
 *
 * Faixas duplicadas — a mesma linha de início e de fim vindas do bloco e da
 * região — são colapsadas numa só, para não gerar duas setas na mesma linha.
 */
export function computeFoldRanges(text: string, regions: Region[] = scan(text)): FoldRange[] {
  const starts = lineStarts(text);
  const all = [...blockRanges(text, starts, regions), ...regionRanges(text, starts, regions)];

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
