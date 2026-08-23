/**
 * Varredura das tags HTML por offset.
 *
 * O indentador já percorre tags, mas linha a linha e acoplado à sua pilha de
 * frames — quem precisa emparelhar `<div>` com `</div>` ao longo do arquivo
 * inteiro (a dobra) precisa dos offsets. Em vez de refatorar o formatador, que
 * é a peça mais afinada do corpus, esta varredura repete o essencial daquela
 * lógica sobre o texto todo: pular valores de atributo e expressões Liquid, que
 * é onde moram os `>` que não fecham tag nenhuma (`v-if="a > b"`, `{% if a > b %}`).
 *
 * Só enxerga marcação real: o que está em `<script>`, `<style>` e dentro de
 * comentário não vira tag, porque ali `a < b` é comparação e `<div>` é texto.
 *
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import { scan, regionAt, type Region } from './scanner.ts';

export interface HtmlTag {
  /** Nome do elemento, em minúsculas. */
  name: string;
  kind: 'open' | 'close';
  /** Offset do `<`. */
  start: number;
  /** Offset logo depois do `>`. */
  end: number;
  /** `<br />`: abre e fecha na mesma tag. */
  selfClosing: boolean;
}

interface TagRest {
  index: number;
  closed: boolean;
  selfClosing: boolean;
}

/**
 * Avança do interior de uma tag aberta até o `>` ou `/>` que a fecha.
 *
 * Aspas e `{{ }}`/`{% %}` são pulados inteiros. Quando não fecham na mesma
 * linha o caractere é tratado como texto comum, em vez de engolir o resto do
 * arquivo: um apóstrofo solto em `<b>don't` custaria todas as dobras dali para
 * baixo, e o indentador — que trabalha linha a linha — já se comporta assim.
 */
function consumeTagRest(text: string, from: number): TagRest {
  let i = from;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '"' || ch === "'") {
      const close = text.indexOf(ch, i + 1);
      const lineEnd = text.indexOf('\n', i + 1);
      if (close !== -1 && (lineEnd === -1 || close < lineEnd)) {
        i = close + 1;
        continue;
      }
      i++;
      continue;
    }

    if (text.startsWith('{{', i)) {
      const end = text.indexOf('}}', i + 2);
      i = end === -1 ? i + 2 : end + 2;
      continue;
    }
    if (text.startsWith('{%', i)) {
      const end = text.indexOf('%}', i + 2);
      i = end === -1 ? i + 2 : end + 2;
      continue;
    }

    if (ch === '/' && text[i + 1] === '>') {
      return { index: i + 2, closed: true, selfClosing: true };
    }
    if (ch === '>') {
      return { index: i + 1, closed: true, selfClosing: false };
    }
    i++;
  }
  return { index: text.length, closed: false, selfClosing: false };
}

/** `</div >`, `</my-component>`. Sticky: casa a partir do offset, sem fatiar o texto. */
const CLOSE_TAG_RE = /\/\s*([a-zA-Z][\w:.-]*)\s*>/y;
/** O nome logo depois do `<`. */
const OPEN_TAG_RE = /([a-zA-Z][\w:.-]*)/y;

/**
 * `true` quando o corpo de um `<script>` é marcação, e não código.
 *
 * `type="text/x-template"` é como o tema entrega o template de um componente ao
 * Vue. Quem diz isso é o cabeçalho do próprio `<script>`, que fica logo antes do
 * início da região.
 */
export function isVueTemplateScript(text: string, region: Region): boolean {
  return (
    region.kind === 'script' &&
    /<script\b[^>]*type\s*=\s*["'][^"']*template[^"']*["'][^>]*>$/i.test(text.slice(0, region.start))
  );
}

/** Regiões em que `<x>` é marcação de verdade. */
function isMarkupRegion(text: string, region: Region): boolean {
  // `raw` entra: ali dentro mora o template do Vue, que é HTML como qualquer outro.
  if (region.kind === 'liquid' || region.kind === 'raw') {
    return true;
  }
  return isVueTemplateScript(text, region);
}

/**
 * Todas as tags HTML do documento, na ordem em que aparecem.
 *
 * Um `<` que não é começo de tag — `a < b`, `<3` — é descartado pelo casamento
 * do nome. Declarações (`<!doctype`), comentários e instruções de processamento
 * são pulados inteiros.
 */
export function findHtmlTags(text: string, regions: Region[] = scan(text)): HtmlTag[] {
  const tags: HtmlTag[] = [];
  let cursor = 0;

  // As regiões vêm ordenadas e os offsets só crescem, então guardar a última
  // resposta basta: sem isso, o `slice` do `<script type=…>` custaria uma cópia
  // do início do arquivo a cada `<` encontrado.
  let lastRegion: Region | undefined;
  let lastIsMarkup = false;

  while (cursor < text.length) {
    const lt = text.indexOf('<', cursor);
    if (lt === -1) {
      break;
    }
    cursor = lt + 1;

    const region = regionAt(regions, lt);
    if (region !== lastRegion) {
      lastRegion = region;
      lastIsMarkup = region ? isMarkupRegion(text, region) : false;
    }
    if (!lastIsMarkup) {
      continue;
    }

    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      cursor = end === -1 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<!', lt) || text.startsWith('<?', lt)) {
      const end = text.indexOf('>', lt);
      cursor = end === -1 ? text.length : end + 1;
      continue;
    }

    if (text[lt + 1] === '/') {
      CLOSE_TAG_RE.lastIndex = lt + 1;
      const closing = CLOSE_TAG_RE.exec(text);
      if (closing) {
        tags.push({
          name: closing[1].toLowerCase(),
          kind: 'close',
          start: lt,
          end: CLOSE_TAG_RE.lastIndex,
          selfClosing: false,
        });
        cursor = CLOSE_TAG_RE.lastIndex;
      }
      continue;
    }

    OPEN_TAG_RE.lastIndex = lt + 1;
    const opening = OPEN_TAG_RE.exec(text);
    if (!opening) {
      continue;
    }
    const rest = consumeTagRest(text, OPEN_TAG_RE.lastIndex);
    if (!rest.closed) {
      // Tag sem `>` até o fim do arquivo: não há mais estrutura a extrair.
      break;
    }
    tags.push({
      name: opening[1].toLowerCase(),
      kind: 'open',
      start: lt,
      end: rest.index,
      selfClosing: rest.selfClosing,
    });
    cursor = rest.index;
  }

  return tags;
}
