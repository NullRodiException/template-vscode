/**
 * Detecção dos blocos JSON de um `.template`.
 *
 * Estes arquivos carregam JSON de verdade em dois lugares: solto no corpo do
 * template — `index.template:1-81` é um array de 81 linhas de menu, incluído por
 * outro arquivo e consumido pelo Vue — e dentro de
 * `<script type="application/json">` / `application/ld+json`. Em ambos, o
 * indentador não tinha o que fazer: não há elemento HTML nem bloco Liquid ali, e
 * o arquivo inteiro ficava encostado na margem.
 *
 * A detecção é **conservadora de propósito**: um bloco só é JSON quando parseia
 * inteiro, do `{`/`[` até o par dele, e o que há dentro são exclusivamente
 * tokens de JSON e expressões Liquid. Qualquer outra coisa — um `<`, um `;`, uma
 * palavra solta — desiste do candidato e o texto volta a ser tratado como
 * marcação. É o que impede um `{` perdido no meio de HTML de arrastar o resto do
 * arquivo para uma indentação de JSON.
 *
 * O Liquid entra como átomo em qualquer posição: `{% for %}` gerando itens de um
 * array e `{{ Model.Id }}` no lugar de um valor são a forma normal de escrever
 * esses blocos, e nenhum parser de JSON os aceitaria.
 *
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import { scan, type Region } from './scanner.ts';

export interface JsonSpan {
  /** Offset do `{` ou `[` que abre. */
  start: number;
  /** Offset logo depois do `}` ou `]` que fecha, exclusivo. */
  end: number;
}

/** `type="application/json"`, `application/ld+json`, `text/json`… */
const JSON_MIME_RE = /\btype\s*=\s*["']?[^"'>]*\bjson\b/i;

const OPENERS: Record<string, string> = { '{': '}', '[': ']' };

/**
 * Avança do começo de um valor JSON até o fim dele.
 *
 * @returns o offset logo depois do fechamento, ou `-1` quando o trecho não é
 * JSON — o que inclui o caso de acabar a região antes de o último container
 * fechar.
 */
function scanJsonValue(text: string, start: number, limit: number): number {
  const stack: string[] = [];
  let i = start;

  while (i < limit) {
    const ch = text[i];

    // Liquid é opaco e pode aparecer em qualquer posição: no lugar do valor, da
    // chave, da vírgula ou de um item inteiro do array.
    if (text.startsWith('{{', i) || text.startsWith('{%', i)) {
      const closer = text.startsWith('{{', i) ? '}}' : '%}';
      const end = text.indexOf(closer, i + 2);
      if (end === -1 || end + 2 > limit) {
        return -1;
      }
      i = end + 2;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(OPENERS[ch]);
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      // Fechamento sem abertura, ou trocado (`{ … ]`): não é JSON.
      if (stack.pop() !== ch) {
        return -1;
      }
      i++;
      if (stack.length === 0) {
        return i;
      }
      continue;
    }

    if (ch === '"') {
      i++;
      while (i < limit && text[i] !== '"') {
        i += text[i] === '\\' ? 2 : 1;
      }
      if (i >= limit) {
        return -1;
      }
      i++;
      continue;
    }

    if (ch === ',' || ch === ':' || /\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      i++;
      while (i < limit && /[0-9+\-.eE]/.test(text[i])) {
        i++;
      }
      continue;
    }

    if (text.startsWith('true', i) || text.startsWith('null', i)) {
      i += 4;
      continue;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      continue;
    }

    return -1;
  }

  return -1;
}

/** `true` quando o offset é o primeiro caractere não-branco da sua linha. */
function startsLine(text: string, offset: number): boolean {
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '\n') {
      return true;
    }
    if (ch !== ' ' && ch !== '\t' && ch !== '\r') {
      return false;
    }
  }
  return true;
}

/** Um span só interessa ao indentador se atravessar mais de uma linha. */
function isMultiline(text: string, span: JsonSpan): boolean {
  return text.lastIndexOf('\n', span.end - 1) >= span.start;
}

/**
 * Blocos JSON soltos numa região Liquid.
 *
 * O candidato precisa **abrir a linha**: um `{` no meio de uma frase é texto, e
 * exigir isso corta de saída quase todo falso positivo antes mesmo do parse.
 */
function bareSpans(text: string, region: Region, out: JsonSpan[]): void {
  let i = region.start;
  while (i < region.end) {
    const ch = text[i];
    if ((ch === '{' || ch === '[') && !text.startsWith('{{', i) && !text.startsWith('{%', i)) {
      if (startsLine(text, i)) {
        const end = scanJsonValue(text, i, region.end);
        if (end !== -1) {
          const span = { start: i, end };
          if (isMultiline(text, span)) {
            out.push(span);
          }
          i = end;
          continue;
        }
      }
    }
    i++;
  }
}

/** A tag `<script …>` que abriu este corpo. */
function scriptOpenTag(text: string, bodyStart: number): string {
  const open = text.lastIndexOf('<script', bodyStart);
  return open === -1 ? '' : text.slice(open, bodyStart);
}

/**
 * Os blocos JSON do documento, em ordem e sem sobreposição.
 *
 * São duas fontes: o corpo de um `<script>` que se declara JSON no `type` — um
 * `<script>` sem `type` é JavaScript, e `PageHeader.template:99-242` é
 * exatamente isso: JS com JSON gerado por `{% for %}` no meio, que nenhum
 * formatador pode reorganizar — e o JSON solto no corpo do template.
 */
export function findJsonSpans(text: string, regions: Region[] = scan(text)): JsonSpan[] {
  const out: JsonSpan[] = [];

  for (const region of regions) {
    if (region.kind === 'liquid') {
      bareSpans(text, region, out);
      continue;
    }

    if (region.kind === 'script' && JSON_MIME_RE.test(scriptOpenTag(text, region.start))) {
      const first = text.slice(region.start, region.end).search(/\S/);
      if (first === -1) {
        continue;
      }
      const start = region.start + first;
      const end = scanJsonValue(text, start, region.end);
      if (end !== -1) {
        const span = { start, end };
        if (isMultiline(text, span)) {
          out.push(span);
        }
      }
    }
  }

  return out;
}
