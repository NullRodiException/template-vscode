/**
 * Formatador de indentação para `.template` da Linx.
 *
 * ## A garantia
 *
 * Cada linha produz no máximo **um** edit, e esse edit substitui exclusivamente o
 * range `[0, primeiroCaractereNãoBranco)`. Não existe caminho de código capaz de
 * tocar um caractere não-branco, então nenhum bug daqui pode corromper um arquivo —
 * no pior caso a indentação fica feia.
 *
 * Essa restrição é o que torna o formatador viável neste corpus. A árvore HTML
 * dos `.template` **não é balanceada**: `{% if %}` gera atributos dentro de uma tag
 * aberta (`helpers/input.template:14-19`), os ramos de um `{% if %}/{% else %}`
 * produzem elementos diferentes (`components/register.template:73-101`) e há
 * `</span>` sem par (`components/basket.template:119`). Qualquer formatador que
 * reconstrua o documento a partir de uma AST quebra nesses arquivos.
 *
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import { isBlockTag, isEndTag, isMiddleTag, VOID_ELEMENTS } from '../core/liquidTags.ts';
import { scan, regionsByLine, type Region, type RegionKind } from '../core/scanner.ts';

export interface IndentOptions {
  insertSpaces: boolean;
  tabSize: number;
  /**
   * Como indentar linhas de continuação de atributo — uma tag `<input` cujos
   * atributos seguem nas linhas de baixo.
   */
  attributeIndent: 'oneLevel' | 'preserve';
}

export const DEFAULT_OPTIONS: IndentOptions = {
  insertSpaces: false,
  tabSize: 4,
  attributeIndent: 'oneLevel',
};

/** Tab-ou-espaço e o tamanho do passo, sem as opções que vêm da extensão. */
export type IndentStyle = Pick<IndentOptions, 'insertSpaces' | 'tabSize'>;

/**
 * Deduz o estilo de indentação a partir do próprio texto.
 *
 * Serve ao caminho de salvar, onde não existe `FormattingOptions`: quem as
 * resolve é o editor, a partir de `editor.detectIndentation`, e um documento
 * salvo por *Save All* pode não estar visível em editor nenhum. Cair na
 * configuração global nesse caso converteria em espaço um arquivo escrito com
 * tab — num corpus em que 60% usa tab e 40% usa espaço, isso trocaria a
 * indentação inteira de um arquivo que ninguém pediu para tocar.
 *
 * @returns `null` quando não há uma única linha indentada, e portanto nada em
 * que se basear.
 */
export function detectIndentation(text: string): IndentStyle | null {
  let tabs = 0;
  let spaces = 0;
  /** Quantas vezes cada distância entre indentações consecutivas apareceu. */
  const steps = new Map<number, number>();
  let previousWidth = -1;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const firstNonWs = line.search(/\S/);
    // Linha em branco ou encostada na margem não diz nada sobre o estilo.
    if (firstNonWs <= 0) {
      continue;
    }

    const indent = line.slice(0, firstNonWs);
    if (indent.includes('\t')) {
      tabs++;
      continue;
    }

    spaces++;
    if (previousWidth >= 0 && firstNonWs !== previousWidth) {
      const step = Math.abs(firstNonWs - previousWidth);
      steps.set(step, (steps.get(step) ?? 0) + 1);
    }
    previousWidth = firstNonWs;
  }

  if (tabs === 0 && spaces === 0) {
    return null;
  }
  if (tabs >= spaces) {
    // O tamanho do tab é decisão de exibição do editor, não do arquivo.
    return { insertSpaces: false, tabSize: DEFAULT_OPTIONS.tabSize };
  }

  let size = 0;
  let best = 0;
  for (const [step, count] of steps) {
    // Empate resolve no passo menor: um arquivo de 4 espaços produz também
    // distâncias de 8 (dois níveis de uma vez), nunca o contrário.
    if (count > best || (count === best && step < size)) {
      best = count;
      size = step;
    }
  }
  return { insertSpaces: true, tabSize: size > 0 ? size : DEFAULT_OPTIONS.tabSize };
}

export interface IndentEdit {
  /** Linha 0-indexada. */
  line: number;
  /** Substitui o range `[0, firstNonWhitespaceCharacterIndex)`. */
  newIndent: string;
  /** Tamanho do range substituído. */
  oldIndentLength: number;
}

type Frame = { kind: 'html' | 'liquid'; tag: string };

type Event =
  | { type: 'open'; frame: Frame }
  | { type: 'close'; kind: 'html' | 'liquid'; tag: string }
  | { type: 'middle' };

interface PendingTag {
  tag: string;
  /** Nível em que a linha de abertura da tag ficou. */
  level: number;
  /** Profundidade da pilha quando a tag abriu, para medir aninhamento Liquid interno. */
  stackDepth: number;
}

interface LineState {
  /** Um `{{ … }}` ou `{% … %}` ficou aberto no fim da linha anterior. */
  inInterpolation: boolean;
  interpolationCloser: '}}' | '%}';
  /** Tag HTML cujo `>` ainda não apareceu. */
  pending: PendingTag | null;
}

interface ScanResult {
  events: Event[];
  /** A tag pendente da linha anterior fechou nesta linha. */
  closedPending: boolean;
  /** O `>` ou `/>` que fechou é o primeiro token não-branco da linha. */
  closerAtStart: boolean;
}

interface TagRest {
  index: number;
  closed: boolean;
  selfClosing: boolean;
}

/**
 * Avança do interior de uma tag HTML aberta até o `>` ou `/>` que a fecha,
 * pulando valores de atributo entre aspas e expressões Liquid — que é onde
 * moram os `>` que não são fim de tag (`v-if="a > b"`, `{% if a > b %}`).
 *
 * Os blocos Liquid encontrados aqui dentro são **deliberadamente neutros**: não
 * empilham nem desempilham. No corpus eles geram atributos condicionais
 * (`helpers/input.template:19`, `components/register.template:76-78`) e sempre
 * abrem e fecham dentro da própria tag, então indentá-los renderia pouco; em
 * compensação, um `{% if %}` que abrisse aqui e fechasse depois do `>` deixaria
 * um frame órfão na pilha e desalinharia todo o resto do arquivo.
 */
function consumeTagRest(line: string, from: number): TagRest {
  let i = from;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < line.length && line[i] !== quote) {
        i++;
      }
      i++;
      continue;
    }
    if (line.startsWith('{{', i)) {
      const end = line.indexOf('}}', i + 2);
      i = end === -1 ? line.length : end + 2;
      continue;
    }
    if (line.startsWith('{%', i)) {
      const end = line.indexOf('%}', i + 2);
      i = end === -1 ? line.length : end + 2;
      continue;
    }
    if (line.startsWith('/>', i)) {
      return { index: i + 2, closed: true, selfClosing: true };
    }
    if (ch === '>') {
      return { index: i + 1, closed: true, selfClosing: false };
    }
    i++;
  }
  return { index: line.length, closed: false, selfClosing: false };
}

function emitLiquidEvent(events: Event[], name: string): void {
  if (!name) {
    return;
  }
  if (isBlockTag(name)) {
    events.push({ type: 'open', frame: { kind: 'liquid', tag: name } });
  } else if (isEndTag(name)) {
    events.push({ type: 'close', kind: 'liquid', tag: name.slice(3) });
  } else if (isMiddleTag(name)) {
    events.push({ type: 'middle' });
  }
  // Todo o resto — incluindo raw/endraw e as 12 tags proprietárias — é neutro de
  // propósito. Assim uma 13ª tag da Linx nunca desbalanceia a pilha.
}

/** Percorre a linha emitindo eventos de estrutura e atualizando o estado contínuo. */
function scanLine(line: string, state: LineState): ScanResult {
  const events: Event[] = [];
  let closedPending = false;
  let closerAtStart = false;
  let i = 0;

  /** Avança até o fechamento da interpolação; `false` se ela continua na próxima linha. */
  const skipInterpolation = (closer: '}}' | '%}'): boolean => {
    const end = line.indexOf(closer, i);
    if (end === -1) {
      i = line.length;
      return false;
    }
    i = end + 2;
    return true;
  };

  if (state.inInterpolation) {
    if (!skipInterpolation(state.interpolationCloser)) {
      return { events, closedPending, closerAtStart };
    }
    state.inInterpolation = false;
  }

  if (state.pending) {
    const firstNonWs = line.search(/\S/);
    const rest = consumeTagRest(line, i);
    i = rest.index;
    if (!rest.closed) {
      return { events, closedPending, closerAtStart };
    }
    closedPending = true;
    closerAtStart =
      firstNonWs >= 0 && (line[firstNonWs] === '>' || line.startsWith('/>', firstNonWs));
    if (!rest.selfClosing && !VOID_ELEMENTS.has(state.pending.tag)) {
      events.push({ type: 'open', frame: { kind: 'html', tag: state.pending.tag } });
    }
    state.pending = null;
  }

  while (i < line.length) {
    if (line.startsWith('{{', i)) {
      i += 2;
      if (!skipInterpolation('}}')) {
        state.inInterpolation = true;
        state.interpolationCloser = '}}';
      }
      continue;
    }

    if (line.startsWith('{%', i)) {
      i += 2;
      const nameMatch = /^-?\s*([a-zA-Z_]\w*)/.exec(line.slice(i));
      if (!skipInterpolation('%}')) {
        state.inInterpolation = true;
        state.interpolationCloser = '%}';
      }
      emitLiquidEvent(events, nameMatch ? nameMatch[1] : '');
      continue;
    }

    if (line[i] === '<') {
      if (line.startsWith('<!--', i)) {
        const end = line.indexOf('-->', i + 4);
        // Comentário que não fecha aqui: o resto é opaco e o scanner de regiões
        // já marcou as linhas seguintes como `html-comment`.
        i = end === -1 ? line.length : end + 3;
        continue;
      }
      if (line.startsWith('<!', i) || line.startsWith('<?', i)) {
        const end = line.indexOf('>', i);
        i = end === -1 ? line.length : end + 1;
        continue;
      }

      const closeMatch = /^<\/\s*([a-zA-Z][\w:.-]*)\s*>/.exec(line.slice(i));
      if (closeMatch) {
        events.push({ type: 'close', kind: 'html', tag: closeMatch[1].toLowerCase() });
        i += closeMatch[0].length;
        continue;
      }

      const openMatch = /^<([a-zA-Z][\w:.-]*)/.exec(line.slice(i));
      if (openMatch) {
        const tag = openMatch[1].toLowerCase();
        i += openMatch[0].length;
        const rest = consumeTagRest(line, i);
        i = rest.index;
        if (!rest.closed) {
          // Continua nas próximas linhas; o chamador preenche level/stackDepth.
          state.pending = { tag, level: 0, stackDepth: 0 };
          return { events, closedPending, closerAtStart };
        }
        if (!rest.selfClosing && !VOID_ELEMENTS.has(tag)) {
          events.push({ type: 'open', frame: { kind: 'html', tag } });
        }
        continue;
      }

      i++;
      continue;
    }

    i++;
  }

  return { events, closedPending, closerAtStart };
}

/**
 * Desempilha até o frame correspondente, tolerando desbalanceamento.
 *
 * Busca no máximo 3 níveis e nunca atravessa um frame de outro tipo. Um
 * fechamento sem abertura correspondente — `basket.template:119` tem um
 * `</span>` órfão — é ignorado, em vez de esvaziar a pilha e desalinhar todo o
 * resto do arquivo.
 */
function popTolerant(stack: Frame[], kind: 'html' | 'liquid', tag: string): number {
  const top = stack[stack.length - 1];
  if (top && top.kind === kind && top.tag === tag) {
    stack.pop();
    return 1;
  }

  const limit = Math.max(0, stack.length - 3);
  for (let i = stack.length - 1; i >= limit; i--) {
    const frame = stack[i];
    if (frame.kind !== kind) {
      // Não atravessa fronteira de frame Liquid: é o que faz o <form> de
      // register.template — aberto na linha 19, fechado na 120, com um bloco
      // Liquid inteiro no meio — sobreviver.
      break;
    }
    if (frame.tag === tag) {
      const popped = stack.length - i;
      stack.length = i;
      return popped;
    }
  }
  return 0;
}

/**
 * Aplica os eventos à pilha e devolve o nível da própria linha: parte do topo e
 * desconta os fechamentos que ocorrem antes de qualquer abertura.
 */
function processEvents(stack: Frame[], events: Event[]): number {
  let level = stack.length;
  let seenOpen = false;

  for (const event of events) {
    if (event.type === 'open') {
      seenOpen = true;
      stack.push(event.frame);
    } else if (event.type === 'middle') {
      if (!seenOpen) {
        level -= 1;
      }
    } else {
      const popped = popTolerant(stack, event.kind, event.tag);
      if (popped > 0 && !seenOpen) {
        level -= popped;
      }
    }
  }
  return Math.max(0, level);
}

/** Regiões cujo conteúdo é opaco: nem indentado, nem contado. */
const OPAQUE: ReadonlySet<RegionKind> = new Set<RegionKind>([
  'script',
  'style',
  'liquid-comment',
  'html-comment',
]);

function makeIndent(level: number, options: IndentOptions): string {
  const n = Math.max(0, level);
  return options.insertSpaces ? ' '.repeat(n * options.tabSize) : '\t'.repeat(n);
}

/** Marca de "não emitir edit para esta linha". */
const VERBATIM = -1;

/**
 * Calcula a indentação de cada linha.
 *
 * Devolve apenas as linhas cuja indentação muda; linhas em região opaca e
 * continuações de interpolação multi-linha não geram edit nenhum.
 */
export function computeIndentation(
  text: string,
  options: IndentOptions = DEFAULT_OPTIONS,
  regions: Region[] = scan(text),
): IndentEdit[] {
  const lines = text.split('\n');
  const kinds = regionsByLine(text, regions);
  const edits: IndentEdit[] = [];

  const stack: Frame[] = [];
  const state: LineState = { inInterpolation: false, interpolationCloser: '}}', pending: null };

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].replace(/\r$/, '');
    const firstNonWs = line.search(/\S/);
    const kind = kinds[ln];

    if (firstNonWs === -1) {
      // Linha em branco: a indentação residual some.
      if (line.length > 0 && !OPAQUE.has(kind)) {
        edits.push({ line: ln, newIndent: '', oldIndentLength: line.length });
      }
      continue;
    }

    // Corpo de <script>, <style>, {% comment %} e o interior de comentários HTML
    // multi-linha ficam exatamente como estão. PageHeader.template:99-242 não é
    // JavaScript parseável — há {% for %} gerando arrays JSON ali dentro —, então
    // nenhum formatador pode reorganizar aquilo.
    if (OPAQUE.has(kind)) {
      continue;
    }

    const wasInInterpolation = state.inInterpolation;
    const pendingBefore = state.pending;

    const { events, closedPending, closerAtStart } = scanLine(line, state);

    let lineLevel: number;
    if (wasInInterpolation) {
      // Mustache Vue quebrado em várias linhas (payments.template:107-109):
      // reindentar mudaria o texto renderizado, então não se toca.
      lineLevel = VERBATIM;
    } else if (pendingBefore) {
      if (options.attributeIndent === 'preserve') {
        lineLevel = VERBATIM;
      } else if (closedPending && closerAtStart) {
        // O `>` sozinho numa linha volta ao nível da própria tag
        // (register.template:79).
        lineLevel = pendingBefore.level;
      } else {
        lineLevel = pendingBefore.level + 1 + (stack.length - pendingBefore.stackDepth);
      }
      // A pilha só cresce depois de decidir o nível desta linha.
      processEvents(stack, events);
    } else {
      lineLevel = processEvents(stack, events);
    }

    if (pendingBefore && !closedPending) {
      // Ainda dentro da mesma tag: mantém o enquadramento original.
      state.pending = pendingBefore;
    } else if (state.pending && state.pending !== pendingBefore) {
      // Uma tag abriu nesta linha e não fechou: as próximas são continuação.
      state.pending.level = lineLevel === VERBATIM ? stack.length : lineLevel;
      state.pending.stackDepth = stack.length;
    }

    if (lineLevel === VERBATIM) {
      continue;
    }

    const desired = makeIndent(lineLevel, options);
    const current = line.slice(0, firstNonWs);
    if (current !== desired) {
      edits.push({ line: ln, newIndent: desired, oldIndentLength: firstNonWs });
    }
  }

  return edits;
}

/** Aplica os edits ao texto. Usado pelos testes e pelo provider de formatação. */
export function applyIndentation(text: string, edits: IndentEdit[]): string {
  if (edits.length === 0) {
    return text;
  }
  const lines = text.split('\n');
  for (const edit of edits) {
    const line = lines[edit.line];
    const hasCr = line.endsWith('\r');
    const body = hasCr ? line.slice(0, -1) : line;
    lines[edit.line] = edit.newIndent + body.slice(edit.oldIndentLength) + (hasCr ? '\r' : '');
  }
  return lines.join('\n');
}

/** Conveniência para testes: formata e devolve o texto resultante. */
export function formatText(text: string, options: IndentOptions = DEFAULT_OPTIONS): string {
  return applyIndentation(text, computeIndentation(text, options));
}
