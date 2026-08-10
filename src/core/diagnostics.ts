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
import { analyzeBlocks } from './blocks.ts';
import { LINX_FILTERS, VUE_FILTERS } from './liquidTags.ts';

export type ProblemCode =
  | 'unbalanced-raw'
  | 'unbalanced-block'
  | 'comment-in-raw'
  | 'liquid-in-html-comment'
  | 'filter-wrong-region';

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
 * Bloco Liquid aberto e nunca fechado — `{% if %}` sem `{% endif %}`, `{% for %}`
 * sem `{% endfor %}` — e o inverso.
 *
 * É o erro mais comum do Liquid, e o único que nem o formatador nem a gramática
 * denunciam: o indentador é deliberadamente tolerante a desbalanceamento
 * (`popTolerant` em `format/indenter.ts`) para não desalinhar o arquivo inteiro
 * por causa de um `</span>` órfão, então uma tag faltando passa despercebida até
 * a página quebrar no servidor.
 */
function checkUnbalancedBlocks(text: string, regions: Region[]): Problem[] {
  const { unclosed, orphanEnds } = analyzeBlocks(text, regions);

  return [
    ...orphanEnds.map(
      (end): Problem => ({
        code: 'unbalanced-block',
        severity: 'error',
        message: `{% end${end.tag} %} sem o {% ${end.tag} %} correspondente.`,
        start: end.start,
        end: end.end,
      }),
    ),
    ...unclosed.map(
      (open): Problem => ({
        code: 'unbalanced-block',
        severity: 'error',
        message: open.closedByOuter
          ? `{% ${open.tag} %} nunca é fechado — o {% ${open.closedByOuter} %} seguinte fecha o bloco de fora.`
          : `{% ${open.tag} %} nunca é fechado. Falta o {% end${open.tag} %}.`,
        start: open.start,
        end: open.end,
      }),
    ),
  ];
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

/** Um `{{ … }}` ou `{% … %}` inteiro, para não confundir o `|` do JS com filtro. */
const INTERPOLATION_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
/** `| nome`, sem casar com o `||` do JavaScript. */
const FILTER_RE = /(?<!\|)\|\s*([a-zA-Z_]\w*)/g;

/**
 * Filtro usado do lado errado da fronteira `{% raw %}`.
 *
 * Os dois conjuntos não se misturam e a confusão é silenciosa: um `| currency`
 * fora de raw é filtro do Vue chamado onde só existe o servidor — o Liquid não o
 * conhece e o valor sai cru. Um `| json` dentro de raw é o inverso: o navegador
 * recebe o texto literal `| json` e o Vue não faz nada com ele.
 *
 * Só reporta o nome que existe **exclusivamente** na tabela do outro lado; nomes
 * presentes nas duas (ou em nenhuma) ficam de fora, para não transformar cada
 * filtro customizado do projeto em aviso.
 */
function checkFilterRegion(text: string, regions: Region[]): Problem[] {
  const problems: Problem[] = [];

  INTERPOLATION_RE.lastIndex = 0;
  let interpolation: RegExpExecArray | null;
  while ((interpolation = INTERPOLATION_RE.exec(text)) !== null) {
    const kind = regionAt(regions, interpolation.index)?.kind;
    if (kind === 'liquid-comment') {
      continue;
    }
    const inRaw = kind === 'raw';

    FILTER_RE.lastIndex = 0;
    let filter: RegExpExecArray | null;
    while ((filter = FILTER_RE.exec(interpolation[0])) !== null) {
      const name = filter[1];
      const isLinx = name in LINX_FILTERS;
      const isVue = name in VUE_FILTERS;
      if (isLinx === isVue) {
        continue;
      }

      const start = interpolation.index + filter.index + filter[0].indexOf(name);
      if (inRaw && isLinx) {
        problems.push({
          code: 'filter-wrong-region',
          severity: 'warning',
          message: `\`${name}\` é filtro do Liquid, processado no servidor — dentro de {% raw %} ele não roda e o texto sai literal.`,
          start,
          end: start + name.length,
        });
      } else if (!inRaw && isVue) {
        problems.push({
          code: 'filter-wrong-region',
          severity: 'warning',
          message: `\`${name}\` é filtro do Vue e só funciona dentro de {% raw %}. Aqui o Liquid não o conhece.`,
          start,
          end: start + name.length,
        });
      }
    }
  }

  return problems;
}

export function analyze(text: string, regions: Region[] = scan(text)): Problem[] {
  const rawProblems = checkUnbalancedRaw(text);

  // Um raw desbalanceado desloca a fronteira de todas as regiões seguintes, e aí
  // metade do arquivo muda de linguagem. Reportar blocos em cima disso produziria
  // uma cascata de erros derivados que escondem a causa única.
  const blockProblems = rawProblems.some((p) => p.severity === 'error')
    ? []
    : checkUnbalancedBlocks(text, regions);

  return [
    ...rawProblems,
    ...blockProblems,
    ...checkCommentInRaw(text, regions),
    ...checkLiquidInHtmlComment(text, regions),
    ...checkFilterRegion(text, regions),
  ].sort((a, b) => a.start - b.start);
}
