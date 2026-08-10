/**
 * Comentar e descomentar blocos com `{% comment %}` / `{% endcomment %}`.
 *
 * ## Por que sempre `{% comment %}`
 *
 * Em `.template` convivem quatro sintaxes de comentário e a escolha não é neutra:
 * `<!-- -->` **não desativa Liquid**, porque o Liquid roda antes do HTML. Em
 * `components/delivery-addresses.template:49-63` há um `{% endraw %}` dentro de um
 * comentário HTML que executa normalmente no servidor. Para neutralizar Liquid, só
 * `{% comment %}` serve.
 *
 * A contrapartida é o inverso: dentro de `{% raw %}` o `{% comment %}` não é
 * processado e o conteúdo continua sendo renderizado. Como 19 dos 27 arquivos do
 * corpus são envoltos em raw, isso vai acontecer — e é por isso que
 * `diagnostics.ts` sublinha o caso com um Quick Fix para converter em `<!-- -->`.
 *
 * Puro e sem `vscode`, para ser testável.
 */

import { scan, regionAt, type Region } from './scanner.ts';

export interface TextEditOp {
  start: number;
  end: number;
  newText: string;
}

export interface ToggleResult {
  edits: TextEditOp[];
  action: 'comment' | 'uncomment';
  /**
   * O comentário foi inserido dentro de `{% raw %}`, onde ele não é processado.
   * O comando usa isso para avisar na hora, sem esperar o diagnóstico.
   */
  insideRaw: boolean;
}

const OPEN_TAG_RE = /\{%-?\s*comment\s*-?%\}/g;
const CLOSE_TAG_RE = /\{%-?\s*endcomment\s*-?%\}/g;

/** Início da linha que contém o offset. */
function lineStart(text: string, offset: number): number {
  const idx = text.lastIndexOf('\n', Math.max(0, offset - 1));
  return idx === -1 ? 0 : idx + 1;
}

/** Fim da linha que contém o offset, sem incluir o `\n`. */
function lineEnd(text: string, offset: number): number {
  const idx = text.indexOf('\n', offset);
  return idx === -1 ? text.length : idx;
}

function indentOf(text: string, offset: number): string {
  const start = lineStart(text, offset);
  const match = /^[ \t]*/.exec(text.slice(start, lineEnd(text, start)));
  return match ? match[0] : '';
}

/**
 * Remove uma tag, levando junto a linha inteira quando a tag está sozinha nela.
 * Sem isso, descomentar deixaria linhas em branco espalhadas.
 */
function removeTag(text: string, start: number, end: number): TextEditOp {
  const ls = lineStart(text, start);
  const le = lineEnd(text, end);
  const before = text.slice(ls, start);
  const after = text.slice(end, le);
  if (before.trim() === '' && after.trim() === '') {
    const withNewline = le < text.length ? le + 1 : le;
    return { start: ls, end: withNewline, newText: '' };
  }
  return { start, end, newText: '' };
}

/** Última ocorrência da regex terminando em `before` ou antes. */
function lastMatchBefore(text: string, re: RegExp, before: number): RegExpExecArray | null {
  re.lastIndex = 0;
  let found: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index + m[0].length > before) {
      break;
    }
    found = m;
  }
  return found;
}

/** Primeira ocorrência da regex começando em `from` ou depois. */
function firstMatchFrom(text: string, re: RegExp, from: number): RegExpExecArray | null {
  re.lastIndex = from;
  return re.exec(text);
}

/**
 * Alterna o comentário do bloco que cobre a seleção.
 *
 * Com seleção vazia, opera sobre a linha do cursor. A detecção de "já comentado"
 * usa o scanner de regiões, então funciona mesmo com blocos aninhados dentro do
 * comentário — `components/register.template:42-47` tem um par
 * `{% capture %}/{% endcapture %}` inteiro ali dentro.
 */
export function toggleBlockComment(
  text: string,
  selStart: number,
  selEnd: number,
  regions: Region[] = scan(text),
): ToggleResult {
  const region = regionAt(regions, selStart);

  if (region?.kind === 'liquid-comment') {
    const open = lastMatchBefore(text, new RegExp(OPEN_TAG_RE), region.start);
    const close = firstMatchFrom(text, new RegExp(CLOSE_TAG_RE), region.end);
    if (open && close) {
      // De trás para a frente, para os offsets do primeiro edit não escorregarem.
      return {
        edits: [
          removeTag(text, close.index, close.index + close[0].length),
          removeTag(text, open.index, open.index + open[0].length),
        ],
        action: 'uncomment',
        insideRaw: false,
      };
    }
  }

  const from = lineStart(text, selStart);
  const to = lineEnd(text, selEnd > selStart ? selEnd - (text[selEnd - 1] === '\n' ? 1 : 0) : selStart);
  const indent = indentOf(text, from);

  return {
    edits: [
      { start: to, end: to, newText: `\n${indent}{% endcomment %}` },
      { start: from, end: from, newText: `${indent}{% comment %}\n` },
    ],
    action: 'comment',
    insideRaw: regionAt(regions, from)?.kind === 'raw',
  };
}
