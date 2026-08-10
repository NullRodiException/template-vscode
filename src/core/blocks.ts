/**
 * Emparelhamento dos blocos Liquid de um `.template`.
 *
 * Três consumidores precisam exatamente da mesma pilha e não podem divergir: o
 * diagnóstico de desbalanceamento, o cálculo das faixas dobráveis e o
 * autocomplete de `{% end… %}`. Se cada um mantivesse a sua, um `{% endif %}`
 * poderia ser erro para um e fechamento válido para outro.
 *
 * Trabalha sobre `findLiquidTags`, que já entrega só as tags **ativas** — o que
 * está dentro de `{% raw %}` e de `{% comment %}` não conta. O que está dentro de
 * um comentário HTML **conta**, porque ali o Liquid executa de verdade.
 *
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import { scan, findLiquidTags, type Region } from './scanner.ts';
import { isBlockTag, isEndTag } from './liquidTags.ts';

export interface TagSpan {
  /** Nome sem o prefixo `end`: `if`, `for`, `raw`… */
  tag: string;
  start: number;
  end: number;
}

export interface BlockPair {
  tag: string;
  open: TagSpan;
  close: TagSpan;
}

export interface UnclosedBlock extends TagSpan {
  /**
   * O `end*` de um bloco de fora que provou que este aqui nunca fecha. Ausente
   * quando o bloco simplesmente chegou aberto ao fim do arquivo.
   */
  closedByOuter?: string;
}

export interface BlockStructure {
  /** Pares completos, na ordem em que **fecham**. */
  pairs: BlockPair[];
  /** Aberturas sem fechamento. */
  unclosed: UnclosedBlock[];
  /** Fechamentos sem abertura correspondente. */
  orphanEnds: TagSpan[];
}

export interface BlockOptions {
  /**
   * Tratar `{% raw %}` e `{% comment %}` como blocos.
   *
   * Desligado por padrão: para indentação e diagnóstico eles são deliberadamente
   * neutros (19 dos 27 arquivos do corpus são envoltos em raw inteiro, e a regra
   * `unbalanced-raw` já cuida do desbalanceamento deles). A dobra, ao contrário,
   * quer justamente esses dois — são os blocos mais longos que existem.
   */
  includeRawAndComment?: boolean;
}

/** Índice do último frame da pilha com a tag indicada, ou -1. */
function lastIndexOfTag(stack: TagSpan[], tag: string): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].tag === tag) {
      return i;
    }
  }
  return -1;
}

export function analyzeBlocks(
  text: string,
  regions: Region[] = scan(text),
  options: BlockOptions = {},
): BlockStructure {
  const raw = options.includeRawAndComment === true;
  const pairs: BlockPair[] = [];
  const unclosed: UnclosedBlock[] = [];
  const orphanEnds: TagSpan[] = [];
  const stack: TagSpan[] = [];

  const opens = (name: string) =>
    isBlockTag(name) || (raw && (name === 'raw' || name === 'comment'));
  const closes = (name: string) =>
    isEndTag(name) || (raw && (name === 'endraw' || name === 'endcomment'));

  for (const tag of findLiquidTags(text, regions)) {
    if (tag.isOutput || !tag.name) {
      continue;
    }

    if (opens(tag.name)) {
      stack.push({ tag: tag.name, start: tag.start, end: tag.end });
      continue;
    }
    if (!closes(tag.name)) {
      continue;
    }

    const opener = tag.name.slice(3);
    const openIndex = lastIndexOfTag(stack, opener);
    const close: TagSpan = { tag: opener, start: tag.start, end: tag.end };

    if (openIndex === -1) {
      orphanEnds.push(close);
      continue;
    }

    // Fechar um bloco de fora prova que todos os de dentro ficaram abertos.
    for (const orphan of stack.slice(openIndex + 1)) {
      unclosed.push({ ...orphan, closedByOuter: tag.name });
    }
    pairs.push({ tag: opener, open: stack[openIndex], close });
    stack.length = openIndex;
  }

  unclosed.push(...stack);
  return { pairs, unclosed, orphanEnds };
}

/**
 * Blocos abertos na posição indicada, do mais externo ao mais interno.
 *
 * Só o que vem **antes** do cursor importa para saber o que está aberto ali, e é
 * exatamente isso que o autocomplete de `{% end… %}` precisa saber. Blocos que
 * um fechamento externo já provou órfãos ficam de fora: sugerir fechá-los seria
 * sugerir uma tag que não conserta nada.
 */
export function openBlocksAt(text: string, offset: number, options: BlockOptions = {}): TagSpan[] {
  const before = text.slice(0, offset);
  return analyzeBlocks(before, undefined, options).unclosed.filter(
    (block) => block.closedByOuter === undefined,
  );
}
