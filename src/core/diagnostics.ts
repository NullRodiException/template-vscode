/**
 * Regras de diagnóstico específicas do dialeto.
 *
 * Cobre erros que só existem por causa da interação Liquid × raw × HTML, e que
 * nenhuma ferramenta genérica de Liquid ou de HTML detecta.
 *
 * Puro e sem `vscode`; a regra de include inexistente vive no provider, porque
 * precisa tocar o disco.
 */

import { scan, regionAt, type Region } from './scanner.ts';

export type ProblemCode =
  | 'unbalanced-raw'
  | 'comment-in-raw'
  | 'liquid-in-html-comment';

export type Severity = 'error' | 'warning' | 'info';

export interface Problem {
  code: ProblemCode;
  severity: Severity;
  message: string;
  start: number;
  end: number;
}

const BOUNDARY_RE = /\{%-?\s*(raw|endraw|comment|endcomment)\b\s*-?%\}/g;
const COMMENT_OPEN_RE = /\{%-?\s*comment\s*-?%\}/g;
const LIQUID_TAG_RE = /\{%-?\s*([a-zA-Z_]\w*)/g;

/**
 * `{% raw %}` sem `{% endraw %}` (ou o contrário).
 *
 * É o erro mais caro do dialeto: um raw aberto engole o resto do arquivo e a
 * página vai para produção com o template cru aparecendo na tela.
 */
function checkUnbalancedRaw(text: string): Problem[] {
  const problems: Problem[] = [];
  let state: 'liquid' | 'raw' | 'comment' = 'liquid';
  let openStart = -1;
  let openEnd = -1;

  BOUNDARY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOUNDARY_RE.exec(text)) !== null) {
    const keyword = m[1];
    const start = m.index;
    const end = start + m[0].length;

    if (state === 'liquid') {
      if (keyword === 'raw') {
        state = 'raw';
        openStart = start;
        openEnd = end;
      } else if (keyword === 'comment') {
        state = 'comment';
        openStart = start;
        openEnd = end;
      } else {
        problems.push({
          code: 'unbalanced-raw',
          severity: 'error',
          message: `{% ${keyword} %} sem o {% ${keyword.slice(3)} %} correspondente.`,
          start,
          end,
        });
      }
    } else if (state === 'raw' && keyword === 'endraw') {
      state = 'liquid';
    } else if (state === 'comment' && keyword === 'endcomment') {
      state = 'liquid';
    }
  }

  if (state === 'raw') {
    problems.push({
      code: 'unbalanced-raw',
      severity: 'error',
      message:
        '{% raw %} nunca é fechado. Sem o {% endraw %}, o resto do arquivo é renderizado como texto cru.',
      start: openStart,
      end: openEnd,
    });
  } else if (state === 'comment') {
    problems.push({
      code: 'unbalanced-raw',
      severity: 'error',
      message: '{% comment %} nunca é fechado. O resto do arquivo não será renderizado.',
      start: openStart,
      end: openEnd,
    });
  }

  return problems;
}

/**
 * `{% comment %}` dentro de `{% raw %}`, onde ele não é processado e o conteúdo
 * continua aparecendo na página.
 */
function checkCommentInRaw(text: string, regions: Region[]): Problem[] {
  const problems: Problem[] = [];
  COMMENT_OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMMENT_OPEN_RE.exec(text)) !== null) {
    if (regionAt(regions, m.index)?.kind === 'raw') {
      problems.push({
        code: 'comment-in-raw',
        severity: 'warning',
        message:
          'Dentro de {% raw %} o {% comment %} não é processado — o conteúdo continua sendo renderizado. Use <!-- --> aqui.',
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  return problems;
}

/**
 * Tag Liquid ativa dentro de um comentário HTML.
 *
 * O comentário HTML não protege nada: o Liquid roda antes do HTML. Em
 * `components/delivery-addresses.template:49-63` um `{% endraw %}` comentado
 * executa e muda a região do resto do arquivo.
 *
 * Só reporta *tags* `{% %}`, que podem ter efeito colateral. Um `{{ }}` dentro
 * de comentário é inofensivo e reportá-lo seria só ruído.
 */
function checkLiquidInHtmlComment(text: string, regions: Region[]): Problem[] {
  const problems: Problem[] = [];
  let cursor = 0;

  while (true) {
    const open = text.indexOf('<!--', cursor);
    if (open === -1) {
      break;
    }
    const close = text.indexOf('-->', open + 4);
    const end = close === -1 ? text.length : close;

    LIQUID_TAG_RE.lastIndex = open;
    let m: RegExpExecArray | null;
    while ((m = LIQUID_TAG_RE.exec(text)) !== null && m.index < end) {
      const kind = regionAt(regions, m.index)?.kind;
      if (kind === 'raw' || kind === 'liquid-comment') {
        continue;
      }
      const tagEnd = text.indexOf('%}', m.index);
      problems.push({
        code: 'liquid-in-html-comment',
        severity: 'info',
        message: `O comentário HTML não desativa Liquid: {% ${m[1]} %} continua executando no servidor.`,
        start: m.index,
        end: tagEnd === -1 ? m.index + m[0].length : tagEnd + 2,
      });
      break; // Uma marcação por comentário basta.
    }

    cursor = close === -1 ? text.length : close + 3;
  }

  return problems;
}

export function analyze(text: string, regions: Region[] = scan(text)): Problem[] {
  return [
    ...checkUnbalancedRaw(text),
    ...checkCommentInRaw(text, regions),
    ...checkLiquidInHtmlComment(text, regions),
  ].sort((a, b) => a.start - b.start);
}
