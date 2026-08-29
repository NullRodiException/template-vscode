/**
 * Formatador de indentação para `.template` da Linx.
 *
 * ## Como o nível de uma linha sai
 *
 * Uma pilha só, de elementos HTML e blocos Liquid juntos, em que cada frame
 * guarda o **nível em que a sua linha de abertura foi impressa** — não a posição
 * dele na pilha. Daí saem as quatro regras:
 *
 * - **linha de conteúdo**: um adiante do frame aberto mais fundo. O *maior*
 *   nível, não o do topo, porque depois de um `{% end… %}` a pilha guarda o que
 *   ramos diferentes deixaram aberto e esses níveis não vêm em ordem;
 * - **fechamento HTML**: vai para o nível do elemento que ele fecha e o
 *   desempilha — `index.template:25` volta ao nível da `<div>` da linha 7, que
 *   foi aberta em outro ramo de outro bloco;
 * - **tag de bloco Liquid**: o menor entre o nível de antes e o de depois do
 *   bloco. Um bloco que só abre elementos ancora no que veio antes; um que fecha
 *   elementos de fora ancora no que sobra depois. Assim a tag nunca fica à
 *   direita do HTML que vem antes dela nem do HTML que ela mesma fecha;
 * - **ramos**: o que um ramo deixa aberto sai da pilha na tag do meio, senão o
 *   ramo seguinte nasceria mais fundo que o anterior, e todos voltam no
 *   `{% end… %}`.
 *
 * O que não funciona aqui é contar altura de pilha: o ramo de um `{% if %}` abre
 * elementos e não os fecha (`index.template:1-8` abre três `<div>`), quem os
 * fecha é um `</div>` depois do bloco ou dentro de outro ramo, e o `{% endif %}`
 * acaba tantos níveis à frente do seu `{% if %}` quantos o ramo tiver deixado
 * abertos.
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

import {
  isBlockTag,
  isEndTag,
  isMiddleTag,
  ownsMiddle,
  VOID_ELEMENTS,
} from '../core/liquidTags.ts';
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

/**
 * Elemento HTML ou bloco Liquid aberto.
 *
 * `level` é o nível em que a **linha de abertura** foi impressa, e não a posição
 * do frame na pilha. É essa distinção que faz um `<div>` que ganhou um nível por
 * estar dentro de um `{% if %}` passar esse nível ao filho — o `<component>` de
 * `index.template:18` fica um adiante da `<div>` da linha 16, que está um
 * adiante do `{% if %}` da 15.
 */
interface HtmlFrame {
  kind: 'html';
  tag: string;
  level: number;
}

/**
 * Bloco Liquid aberto.
 *
 * `carried` guarda o que os ramos já encerrados deixaram aberto em HTML: sai da
 * pilha na tag do meio, senão cada ramo nasceria mais fundo que o anterior, e
 * volta inteiro no `{% end… %}`, porque é depois do bloco que os `</div>`
 * órfãos de `index.template:31,36` aparecem para fechá-lo.
 *
 * `ordinal` é a posição do bloco no documento, contada na ordem em que abrem.
 * É a chave do nível "de depois" entre uma passada e outra — ver
 * `computeIndentation`.
 */
interface BlockFrame {
  kind: 'liquid';
  tag: string;
  level: number;
  ordinal: number;
  carried: HtmlFrame[];
}

type Frame = HtmlFrame | BlockFrame;

/** O que uma linha faz com a estrutura. */
type Event =
  | { type: 'open'; kind: 'html' | 'liquid'; tag: string }
  | { type: 'close'; kind: 'html' | 'liquid'; tag: string }
  | { type: 'middle'; tag: string };

interface PendingTag {
  tag: string;
  /** Nível em que a linha de abertura da tag ficou. */
  level: number;
  /** Profundidade das pilhas quando a tag abriu, para medir aninhamento interno. */
  depth: number;
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
    events.push({ type: 'open', kind: 'liquid', tag: name });
  } else if (isEndTag(name)) {
    events.push({ type: 'close', kind: 'liquid', tag: name.slice(3) });
  } else if (isMiddleTag(name)) {
    events.push({ type: 'middle', tag: name });
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
      events.push({ type: 'open', kind: 'html', tag: state.pending.tag });
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
          state.pending = { tag, level: 0, depth: 0 };
          return { events, closedPending, closerAtStart };
        }
        if (!rest.selfClosing && !VOID_ELEMENTS.has(tag)) {
          events.push({ type: 'open', kind: 'html', tag });
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
 * Nível de uma linha de conteúdo: um adiante do frame aberto mais fundo.
 *
 * O maior nível, não o do topo: depois de um `{% end… %}` a pilha guarda o que
 * ramos diferentes deixaram aberto, e esses níveis não vêm em ordem — em
 * `index.template:9` ela é `[facets@1, content@2, new-facets@1]`, e a linha sai
 * em 3.
 */
function contentLevel(frames: Frame[]): number {
  let deepest = -1;
  for (const frame of frames) {
    if (frame.level > deepest) {
      deepest = frame.level;
    }
  }
  return deepest + 1;
}

/**
 * Índice do elemento que este fechamento encerra, ou `-1`.
 *
 * Bloco Liquid no caminho não atrapalha — o `</div>` de `index.template:25` está
 * dentro de um `{% if %}` e fecha uma `<div>` aberta antes dele. O teto de três
 * elementos é que segura o fechamento órfão: `basket.template:119` tem um
 * `</span>` sem abertura, e sem o teto ele esvaziaria a pilha.
 */
function findHtmlFrame(frames: Frame[], tag: string): number {
  let crossed = 0;
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame.kind !== 'html') {
      continue;
    }
    if (frame.tag === tag) {
      return i;
    }
    if (++crossed === 3) {
      break;
    }
  }
  return -1;
}

/** Índice do bloco Liquid procurado, ou `-1`. Tolera até três blocos que não casam. */
function findBlockFrame(frames: Frame[], matches: (frame: BlockFrame) => boolean): number {
  let crossed = 0;
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame.kind !== 'liquid') {
      continue;
    }
    if (matches(frame)) {
      return i;
    }
    if (++crossed === 3) {
      break;
    }
  }
  return -1;
}

/**
 * Nível da abertura de um bloco Liquid: o menor entre o nível de antes e o de
 * depois do bloco.
 *
 * É o que faz a tag de bloco seguir o HTML. Um bloco que só abre elementos
 * ancora no que veio antes (`index.template:15`: antes 5, depois 7, fica em 5);
 * um que fecha elementos abertos fora dele ancora no que sobra depois
 * (`index.template:19`: antes 7, depois 5, fica em 5; e a linha 24: antes 3,
 * depois 0, fica em 0). Dito de outro jeito, a tag nunca fica à direita do HTML
 * que vem antes dela nem do HTML que ela mesma fecha.
 *
 * Sem o nível de depois — bloco ainda sem `{% end… %}`, que é o caso de quem
 * está digitando — vale só o de antes.
 */
function blockLevel(pass: PassState, before: number): number {
  const after = pass.after.get(pass.opened);
  return after === undefined ? before : Math.min(before, after);
}

/**
 * O nível da linha, decidido pelo seu primeiro evento.
 *
 * Só o primeiro conta porque é ele que começa a linha: o que vem depois muda a
 * pilha para as linhas seguintes, não o recuo desta.
 */
function lineLevelOf(pass: PassState, events: Event[]): number {
  const level = contentLevel(pass.frames);
  const first = events[0];
  if (!first) {
    return level;
  }

  if (first.type === 'open') {
    return first.kind === 'liquid' ? blockLevel(pass, level) : level;
  }

  if (first.type === 'middle') {
    const index = findBlockFrame(pass.frames, (frame) => ownsMiddle(frame.tag, first.tag));
    // `{% else %}` sem bloco: mantém o dedent de sempre.
    return index === -1 ? Math.max(0, level - 1) : pass.frames[index].level;
  }

  if (first.kind === 'liquid') {
    const index = findBlockFrame(pass.frames, (frame) => frame.tag === first.tag);
    return index === -1 ? level : pass.frames[index].level;
  }

  const index = findHtmlFrame(pass.frames, first.tag);
  return index === -1 ? level : pass.frames[index].level;
}

/** Os frames HTML de uma fatia da pilha, na ordem. */
function htmlOnly(frames: Frame[]): HtmlFrame[] {
  return frames.filter((frame): frame is HtmlFrame => frame.kind === 'html');
}

/**
 * Aplica os eventos à pilha.
 *
 * `openLevel` é o nível impresso da linha, que cada elemento aberto aqui guarda
 * para o seu fechamento reencontrar.
 */
function applyEvents(pass: PassState, events: Event[], openLevel: number): void {
  const { frames } = pass;

  for (const event of events) {
    if (event.type === 'open') {
      if (event.kind === 'liquid') {
        frames.push({
          kind: 'liquid',
          tag: event.tag,
          level: blockLevel(pass, contentLevel(frames)),
          ordinal: pass.opened,
          carried: [],
        });
        pass.opened++;
      } else {
        frames.push({ kind: 'html', tag: event.tag, level: openLevel });
      }
      continue;
    }

    if (event.type === 'middle') {
      const index = findBlockFrame(frames, (frame) => ownsMiddle(frame.tag, event.tag));
      if (index === -1) {
        continue;
      }
      const block = frames[index] as BlockFrame;
      // Bloco Liquid aberto dentro do ramo e nunca fechado morre aqui: mantê-lo
      // empilhado empurraria o resto do arquivo.
      block.carried.push(...htmlOnly(frames.splice(index + 1)));
      continue;
    }

    if (event.kind === 'liquid') {
      const index = findBlockFrame(frames, (frame) => frame.tag === event.tag);
      if (index === -1) {
        // `{% endif %}` sem abertura: ignorado, como o `</span>` órfão do HTML.
        continue;
      }
      const block = frames[index] as BlockFrame;
      const opened = htmlOnly(frames.splice(index + 1));
      frames.splice(index, 1);
      // Os ramos anteriores primeiro: é a ordem em que os fechamentos de depois
      // do bloco os encontram (`index.template:25` fecha o do último ramo).
      frames.push(...block.carried, ...opened);
      pass.observed.set(block.ordinal, contentLevel(frames));
      continue;
    }

    const index = findHtmlFrame(frames, event.tag);
    if (index === -1) {
      continue;
    }
    frames.splice(index, 1);
    // O que ficou aberto dentro do elemento vai junto; bloco Liquid fica, senão
    // o `{% else %}` perderia o seu `{% if %}`.
    for (let i = frames.length - 1; i >= index; i--) {
      if (frames[i].kind === 'html') {
        frames.splice(i, 1);
      }
    }
  }
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
/** O estado de uma passada do cálculo. */
interface PassState {
  frames: Frame[];
  /** Quantos blocos Liquid já abriram — o `ordinal` do próximo. */
  opened: number;
  /** Nível logo depois de cada bloco, medido na passada anterior. */
  after: ReadonlyMap<number, number>;
  /** O mesmo, medido nesta. */
  observed: Map<number, number>;
}

function runPass(
  lines: string[],
  kinds: RegionKind[],
  options: IndentOptions,
  after: ReadonlyMap<number, number>,
): { edits: IndentEdit[]; observed: Map<number, number> } {
  const edits: IndentEdit[] = [];
  const pass: PassState = { frames: [], opened: 0, after, observed: new Map() };
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
        lineLevel = pendingBefore.level + 1 + (contentLevel(pass.frames) - pendingBefore.depth);
      }
      // A pilha só cresce depois de decidir o nível desta linha. O elemento que
      // fecha aqui guarda o nível da linha que o abriu, não o desta.
      applyEvents(pass, events, pendingBefore.level);
    } else {
      lineLevel = lineLevelOf(pass, events);
      applyEvents(pass, events, lineLevel);
    }

    if (pendingBefore && !closedPending) {
      // Ainda dentro da mesma tag: mantém o enquadramento original.
      state.pending = pendingBefore;
    } else if (state.pending && state.pending !== pendingBefore) {
      // Uma tag abriu nesta linha e não fechou: as próximas são continuação.
      state.pending.level = lineLevel === VERBATIM ? contentLevel(pass.frames) : lineLevel;
      state.pending.depth = contentLevel(pass.frames);
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

  return { edits, observed: pass.observed };
}

function sameLevels(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    if (b.get(key) !== value) {
      return false;
    }
  }
  return true;
}

/**
 * Calcula a indentação de cada linha.
 *
 * Devolve apenas as linhas cuja indentação muda; linhas em região opaca e
 * continuações de interpolação multi-linha não geram edit nenhum.
 *
 * São várias passadas porque a abertura de um bloco Liquid olha para o nível de
 * *depois* do bloco (`blockLevel`), que só se conhece tendo percorrido o
 * documento. A segunda passada já estabiliza no corpus — o nível de depois é
 * decidido por elementos abertos fora do bloco, e esses não dependem de onde a
 * tag do bloco foi parar. O teto de passadas é só garantia contra laço.
 */
export function computeIndentation(
  text: string,
  options: IndentOptions = DEFAULT_OPTIONS,
  regions: Region[] = scan(text),
): IndentEdit[] {
  const lines = text.split('\n');
  const kinds = regionsByLine(text, regions);

  let after: ReadonlyMap<number, number> = new Map();
  let pass = runPass(lines, kinds, options, after);
  for (let i = 0; i < 3 && !sameLevels(after, pass.observed); i++) {
    after = pass.observed;
    pass = runPass(lines, kinds, options, after);
  }
  return pass.edits;
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
