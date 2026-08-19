/**
 * Tabela do HTML: elementos, atributos e valores.
 *
 * O VS Code só liga o serviço de HTML nas linguagens dele (`html`,
 * `handlebars`, `php`); num id próprio como `linx-liquid` nada disso vem junto,
 * e digitar `h1` dentro de um `.template` não oferecia nada. Daí a tabela — o
 * conjunto que aparece de fato num tema, não o registro inteiro do WHATWG.
 *
 * Puro, sem importar `vscode`: o completion decide como isso vira menu.
 */

import { VOID_ELEMENTS } from './liquidTags.ts';

export interface HtmlElement {
  doc: string;
  /** Atributos próprios do elemento; os globais entram por fora. */
  attributes?: readonly string[];
}

/** Atributos de formulário que quase todo campo aceita. */
const FIELD = ['name', 'disabled', 'required', 'autofocus', 'form'] as const;

export const HTML_ELEMENTS: Record<string, HtmlElement> = {
  // Estrutura do documento
  html: { doc: 'raiz do documento', attributes: ['lang', 'dir'] },
  head: { doc: 'metadados do documento' },
  body: { doc: 'conteúdo visível da página' },
  title: { doc: 'título da aba e do resultado de busca' },
  base: { doc: 'URL base dos links relativos', attributes: ['href', 'target'] },
  link: {
    doc: 'recurso externo: CSS, ícone, preload',
    attributes: ['rel', 'href', 'type', 'media', 'as', 'crossorigin', 'integrity', 'sizes', 'hreflang', 'referrerpolicy'],
  },
  meta: {
    doc: 'metadado: charset, viewport, description',
    attributes: ['name', 'content', 'charset', 'http-equiv', 'property'],
  },
  style: { doc: 'CSS embutido', attributes: ['type', 'media', 'nonce'] },
  script: {
    doc: 'JavaScript embutido ou externo',
    attributes: ['src', 'type', 'async', 'defer', 'nomodule', 'crossorigin', 'integrity', 'referrerpolicy'],
  },
  noscript: { doc: 'conteúdo para quando o script não roda' },
  template: {
    doc: 'marcação inerte — no tema, o `<template id="tpl-…">` do componente Vue',
    attributes: ['id'],
  },
  slot: { doc: 'ponto de inserção de conteúdo do componente', attributes: ['name'] },

  // Seções
  header: { doc: 'cabeçalho da página ou da seção' },
  nav: { doc: 'bloco de navegação' },
  main: { doc: 'conteúdo principal, único na página' },
  section: { doc: 'seção temática, normalmente com título' },
  article: { doc: 'conteúdo que faz sentido sozinho' },
  aside: { doc: 'conteúdo lateral, tangente ao principal' },
  footer: { doc: 'rodapé da página ou da seção' },
  h1: { doc: 'título de primeiro nível' },
  h2: { doc: 'título de segundo nível' },
  h3: { doc: 'título de terceiro nível' },
  h4: { doc: 'título de quarto nível' },
  h5: { doc: 'título de quinto nível' },
  h6: { doc: 'título de sexto nível' },
  hgroup: { doc: 'título com subtítulo' },
  address: { doc: 'dados de contato do autor ou da seção' },

  // Agrupamento
  div: { doc: 'agrupador genérico, sem semântica' },
  p: { doc: 'parágrafo' },
  hr: { doc: 'separação temática' },
  pre: { doc: 'texto pré-formatado, com os espaços preservados' },
  blockquote: { doc: 'citação em bloco', attributes: ['cite'] },
  ol: { doc: 'lista ordenada', attributes: ['type', 'start', 'reversed'] },
  ul: { doc: 'lista não ordenada' },
  li: { doc: 'item de lista', attributes: ['value'] },
  dl: { doc: 'lista de descrição' },
  dt: { doc: 'termo da lista de descrição' },
  dd: { doc: 'descrição do termo' },
  figure: { doc: 'conteúdo autocontido com legenda' },
  figcaption: { doc: 'legenda da figura' },

  // Texto
  span: { doc: 'agrupador inline, sem semântica' },
  a: {
    doc: 'link',
    attributes: ['href', 'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy'],
  },
  em: { doc: 'ênfase' },
  strong: { doc: 'importância' },
  small: { doc: 'observação secundária' },
  s: { doc: 'texto que deixou de valer' },
  cite: { doc: 'título da obra citada' },
  q: { doc: 'citação curta, inline', attributes: ['cite'] },
  dfn: { doc: 'termo sendo definido' },
  abbr: { doc: 'abreviação — o significado vai no `title`' },
  time: { doc: 'data ou hora legível por máquina', attributes: ['datetime'] },
  code: { doc: 'trecho de código' },
  var: { doc: 'variável' },
  samp: { doc: 'saída de programa' },
  kbd: { doc: 'entrada do teclado' },
  sub: { doc: 'subscrito' },
  sup: { doc: 'sobrescrito' },
  i: { doc: 'voz alternativa — no tema, quase sempre o ícone de fonte' },
  b: { doc: 'destaque sem importância extra' },
  u: { doc: 'anotação não textual' },
  mark: { doc: 'trecho realçado por relevância' },
  bdi: { doc: 'trecho isolado da direção do texto ao redor' },
  bdo: { doc: 'direção do texto forçada', attributes: ['dir'] },
  ruby: { doc: 'anotação de pronúncia' },
  rt: { doc: 'texto da anotação ruby' },
  rp: { doc: 'parênteses de fallback do ruby' },
  br: { doc: 'quebra de linha' },
  wbr: { doc: 'ponto onde a quebra é permitida' },
  ins: { doc: 'trecho inserido', attributes: ['cite', 'datetime'] },
  del: { doc: 'trecho removido', attributes: ['cite', 'datetime'] },

  // Mídia
  picture: { doc: 'imagem com fontes alternativas por media query' },
  source: {
    doc: 'fonte de picture, video ou audio',
    attributes: ['src', 'srcset', 'sizes', 'type', 'media', 'width', 'height'],
  },
  img: {
    doc: 'imagem',
    attributes: ['src', 'alt', 'srcset', 'sizes', 'width', 'height', 'loading', 'decoding', 'crossorigin', 'usemap', 'ismap', 'referrerpolicy'],
  },
  iframe: {
    doc: 'documento embutido',
    attributes: ['src', 'srcdoc', 'name', 'width', 'height', 'loading', 'allow', 'allowfullscreen', 'sandbox', 'referrerpolicy'],
  },
  embed: { doc: 'conteúdo externo de plugin', attributes: ['src', 'type', 'width', 'height'] },
  object: {
    doc: 'recurso externo genérico',
    attributes: ['data', 'type', 'name', 'width', 'height', 'form'],
  },
  param: { doc: 'parâmetro do object', attributes: ['name', 'value'] },
  video: {
    doc: 'vídeo',
    attributes: ['src', 'poster', 'width', 'height', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'preload', 'crossorigin'],
  },
  audio: {
    doc: 'áudio',
    attributes: ['src', 'controls', 'autoplay', 'loop', 'muted', 'preload', 'crossorigin'],
  },
  track: {
    doc: 'legenda ou capítulo de mídia',
    attributes: ['src', 'kind', 'srclang', 'label', 'default'],
  },
  map: { doc: 'mapa de área de imagem', attributes: ['name'] },
  area: {
    doc: 'região clicável do mapa',
    attributes: ['shape', 'coords', 'href', 'alt', 'target', 'rel', 'download'],
  },
  canvas: { doc: 'superfície de desenho por script', attributes: ['width', 'height'] },
  svg: { doc: 'vetor inline', attributes: ['viewBox', 'width', 'height', 'fill', 'stroke', 'xmlns'] },
  path: { doc: 'traçado do SVG', attributes: ['d', 'fill', 'stroke', 'stroke-width'] },
  use: { doc: 'referência a um símbolo do SVG', attributes: ['href', 'xlink:href'] },

  // Tabelas
  table: { doc: 'tabela' },
  caption: { doc: 'legenda da tabela' },
  colgroup: { doc: 'grupo de colunas', attributes: ['span'] },
  col: { doc: 'coluna', attributes: ['span'] },
  thead: { doc: 'cabeçalho da tabela' },
  tbody: { doc: 'corpo da tabela' },
  tfoot: { doc: 'rodapé da tabela' },
  tr: { doc: 'linha da tabela' },
  td: { doc: 'célula', attributes: ['colspan', 'rowspan', 'headers'] },
  th: { doc: 'célula de cabeçalho', attributes: ['colspan', 'rowspan', 'headers', 'scope', 'abbr'] },

  // Formulários
  form: {
    doc: 'formulário',
    attributes: ['action', 'method', 'target', 'name', 'enctype', 'novalidate', 'autocomplete', 'accept-charset'],
  },
  label: { doc: 'rótulo de um campo — o `for` casa com o `id` do campo', attributes: ['for', 'form'] },
  input: {
    doc: 'campo de entrada',
    attributes: [
      ...FIELD, 'type', 'value', 'placeholder', 'readonly', 'checked', 'maxlength', 'minlength',
      'min', 'max', 'step', 'pattern', 'multiple', 'accept', 'autocomplete', 'list', 'size',
      'inputmode', 'src', 'alt',
    ],
  },
  button: {
    doc: 'botão',
    attributes: [...FIELD, 'type', 'value', 'formaction', 'formmethod', 'formnovalidate', 'formtarget'],
  },
  select: { doc: 'campo de seleção', attributes: [...FIELD, 'multiple', 'size', 'autocomplete'] },
  datalist: { doc: 'lista de sugestões de um input com `list`', attributes: ['id'] },
  optgroup: { doc: 'grupo de opções', attributes: ['label', 'disabled'] },
  option: { doc: 'opção da lista', attributes: ['value', 'label', 'selected', 'disabled'] },
  textarea: {
    doc: 'campo de texto de várias linhas',
    attributes: [...FIELD, 'placeholder', 'readonly', 'rows', 'cols', 'maxlength', 'minlength', 'wrap', 'autocomplete'],
  },
  output: { doc: 'resultado de um cálculo', attributes: ['for', 'name', 'form'] },
  progress: { doc: 'barra de progresso', attributes: ['value', 'max'] },
  meter: {
    doc: 'medida dentro de uma faixa',
    attributes: ['value', 'min', 'max', 'low', 'high', 'optimum'],
  },
  fieldset: { doc: 'grupo de campos', attributes: ['name', 'disabled', 'form'] },
  legend: { doc: 'título do fieldset' },

  // Interativos
  details: { doc: 'bloco que abre e fecha', attributes: ['open'] },
  summary: { doc: 'resumo clicável do details' },
  dialog: { doc: 'caixa de diálogo', attributes: ['open'] },
};

/** Atributos que valem em qualquer elemento. */
export const GLOBAL_ATTRIBUTES: Record<string, string> = {
  id: 'identificador único no documento',
  class: 'classes de CSS, separadas por espaço',
  style: 'estilo inline',
  title: 'texto do tooltip',
  hidden: 'esconde o elemento',
  lang: 'idioma do conteúdo',
  dir: 'direção do texto',
  tabindex: 'ordem de foco pelo teclado',
  role: 'papel de acessibilidade (ARIA)',
  accesskey: 'tecla de atalho',
  contenteditable: 'permite editar o conteúdo no navegador',
  draggable: 'permite arrastar',
  spellcheck: 'corretor ortográfico',
  translate: 'se o conteúdo deve ser traduzido',
  autocapitalize: 'capitalização automática no teclado virtual',
  inputmode: 'teclado virtual sugerido',
  enterkeyhint: 'rótulo da tecla Enter no teclado virtual',
  itemprop: 'propriedade de microdados',
  itemscope: 'abre um item de microdados',
  itemtype: 'vocabulário dos microdados',
  'data-': 'atributo de dados próprio — lido por `dataset` ou por `[data-x]` no CSS',
  'aria-label': 'nome acessível quando não há texto visível',
  'aria-labelledby': 'id do elemento que dá o nome acessível',
  'aria-describedby': 'id do elemento que descreve este',
  'aria-hidden': 'esconde de leitores de tela — o caso do ícone decorativo',
  'aria-expanded': 'estado de um elemento que abre e fecha',
  'aria-controls': 'id do elemento controlado por este',
  'aria-current': 'item atual dentro de um conjunto',
  'aria-live': 'região que anuncia mudanças',
  'aria-disabled': 'desabilitado do ponto de vista da acessibilidade',
  'aria-selected': 'item selecionado',
};

/** Atributos sem valor: entram sozinhos, sem `=""`. */
export const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set([
  'disabled', 'checked', 'readonly', 'required', 'autofocus', 'multiple', 'selected',
  'autoplay', 'controls', 'loop', 'muted', 'playsinline', 'defer', 'async', 'nomodule',
  'hidden', 'novalidate', 'formnovalidate', 'open', 'reversed', 'default', 'ismap',
  'itemscope', 'inert', 'allowfullscreen', 'download',
]);

/**
 * Valores fechados de um atributo, por `elemento/atributo` ou só pelo nome.
 *
 * A chave com elemento vem primeiro: o `type` de um `<input>` não é o de um
 * `<button>` nem o de um `<script>`.
 */
export const ATTRIBUTE_VALUES: Record<string, readonly string[]> = {
  'input/type': [
    'text', 'password', 'email', 'number', 'tel', 'url', 'search', 'date', 'time',
    'datetime-local', 'month', 'week', 'checkbox', 'radio', 'file', 'hidden', 'submit',
    'reset', 'button', 'color', 'range', 'image',
  ],
  'button/type': ['submit', 'reset', 'button'],
  // `text/x-template` é como o tema entrega a marcação de um componente ao Vue.
  'script/type': ['text/javascript', 'module', 'text/x-template', 'application/json', 'application/ld+json'],
  'style/type': ['text/css'],
  'link/rel': [
    'stylesheet', 'icon', 'apple-touch-icon', 'preload', 'preconnect', 'prefetch',
    'dns-prefetch', 'modulepreload', 'manifest', 'canonical', 'alternate', 'next', 'prev',
  ],
  'link/as': ['script', 'style', 'font', 'image', 'fetch', 'document'],
  'a/rel': ['noopener', 'noreferrer', 'nofollow', 'external', 'alternate', 'canonical', 'sponsored', 'ugc'],
  'area/rel': ['noopener', 'noreferrer', 'nofollow'],
  'form/method': ['get', 'post', 'dialog'],
  'form/enctype': ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
  'button/formmethod': ['get', 'post', 'dialog'],
  'th/scope': ['row', 'col', 'rowgroup', 'colgroup'],
  'ol/type': ['1', 'a', 'A', 'i', 'I'],
  'track/kind': ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'],
  'area/shape': ['rect', 'circle', 'poly', 'default'],
  'meta/name': ['viewport', 'description', 'keywords', 'author', 'robots', 'theme-color', 'referrer'],
  'meta/http-equiv': ['content-type', 'refresh', 'x-ua-compatible', 'content-security-policy'],
  'textarea/wrap': ['soft', 'hard'],
  'video/preload': ['none', 'metadata', 'auto'],
  'audio/preload': ['none', 'metadata', 'auto'],
  target: ['_blank', '_self', '_parent', '_top'],
  loading: ['lazy', 'eager'],
  decoding: ['async', 'sync', 'auto'],
  crossorigin: ['anonymous', 'use-credentials'],
  referrerpolicy: [
    'no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin',
    'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url',
  ],
  dir: ['ltr', 'rtl', 'auto'],
  inputmode: ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'],
  enterkeyhint: ['enter', 'done', 'go', 'next', 'previous', 'search', 'send'],
  autocomplete: [
    'on', 'off', 'name', 'given-name', 'family-name', 'email', 'tel', 'username',
    'current-password', 'new-password', 'one-time-code', 'organization', 'street-address',
    'address-level1', 'address-level2', 'postal-code', 'country', 'cc-name', 'cc-number',
    'cc-exp', 'cc-csc', 'bday',
  ],
  autocapitalize: ['off', 'none', 'sentences', 'words', 'characters'],
  contenteditable: ['true', 'false', 'plaintext-only'],
  draggable: ['true', 'false'],
  spellcheck: ['true', 'false'],
  translate: ['yes', 'no'],
  'aria-hidden': ['true', 'false'],
  'aria-expanded': ['true', 'false'],
  'aria-disabled': ['true', 'false'],
  'aria-selected': ['true', 'false'],
  'aria-current': ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
  'aria-live': ['off', 'polite', 'assertive'],
};

/** Valores conhecidos do atributo naquele elemento; vazio quando é livre. */
export function valuesFor(tag: string, attribute: string): readonly string[] {
  return ATTRIBUTE_VALUES[`${tag}/${attribute}`] ?? ATTRIBUTE_VALUES[attribute] ?? [];
}

/** Atributos do elemento seguidos dos globais, sem repetir. */
export function attributesFor(tag: string): string[] {
  const own = HTML_ELEMENTS[tag]?.attributes ?? [];
  return [...own, ...Object.keys(GLOBAL_ATTRIBUTES).filter((name) => !own.includes(name))];
}

/** Uma tag aberta: já tem o `<` e o nome, e ainda não tem o `>`. */
export interface OpenTag {
  name: string;
  /** Offset do `<`. */
  start: number;
}

interface TagState extends OpenTag {
  /** A aspa ainda aberta, quando o offset cai dentro de um valor. */
  quote?: string;
}

/** Quantos `<` sem nome vale a pena atravessar procurando o começo da tag. */
const CANDIDATE_LIMIT = 8;

/**
 * Tag em que o offset cai, entre o nome e o `>` que ainda não veio.
 *
 * O `>` que fecha a tag é o que está fora de aspas: em `v-if="qtd > 0"` ele é
 * operador, e tratá-lo como fim da tag daria a tag por fechada no meio dela.
 * Pelo mesmo motivo a busca pelo `<` não para no primeiro: em
 * `<a href="a<b"` o último `<` é conteúdo do valor, e quem manda é o `<a`.
 */
function enclosingTag(text: string, offset: number): TagState | undefined {
  const before = text.slice(0, offset);

  let start = before.lastIndexOf('<');
  for (let tries = 0; start !== -1 && tries < CANDIDATE_LIMIT; tries++) {
    const inside = before.slice(start);
    const name = /^<([A-Za-z][\w:.-]*)/.exec(inside)?.[1];
    if (!name) {
      // `</`, `<!--` ou `<` solto: o começo da tag, se houver, está mais atrás.
      start = before.lastIndexOf('<', start - 1);
      continue;
    }

    let quote: string | undefined;
    for (const character of inside) {
      if (quote) {
        if (character === quote) {
          quote = undefined;
        }
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        // A tag fechou antes do offset: ele está no conteúdo, não na tag.
        return undefined;
      }
    }
    return { name, start, quote };
  }
  return undefined;
}

/** Tag aberta em que o offset cai, fora de aspas — posição de atributo. */
export function openTagAt(text: string, offset: number): OpenTag | undefined {
  const state = enclosingTag(text, offset);
  return state && !state.quote ? { name: state.name, start: state.start } : undefined;
}

/** Onde o cursor está escrevendo o nome de uma tag. */
export interface TagNameSlot {
  /** O que já foi digitado depois do `<` ou do `</`. */
  word: string;
  /** Offset do `<` — o trecho substituído começa nele. */
  start: number;
  /** `true` em `</`, quando o que cabe ali é o fechamento do elemento aberto. */
  closing: boolean;
}

/** `<`, `<di` ou `</di`, e nada mais entre o `<` e o cursor. */
const TAG_NAME_RE = /<(\/?)([A-Za-z][\w:.-]*)?$/;

/**
 * Posição de nome de tag em que o cursor está, ou `undefined`.
 *
 * Fica de fora o `<` que não abre tag nenhuma: o operador de
 * `{% if a < b %}`, o que está dentro do valor de um atributo, e o digitado no
 * meio de uma tag que ainda não fechou.
 */
export function tagNameSlotAt(text: string, offset: number): TagNameSlot | undefined {
  const before = text.slice(0, offset);
  const match = TAG_NAME_RE.exec(before);
  if (!match) {
    return undefined;
  }
  const start = offset - match[0].length;
  if (enclosingTag(text, start)) {
    return undefined;
  }

  const head = before.slice(0, start);
  const lastOpen = Math.max(head.lastIndexOf('{%'), head.lastIndexOf('{{'));
  const lastClose = Math.max(head.lastIndexOf('%}'), head.lastIndexOf('}}'));
  if (lastOpen > lastClose) {
    return undefined;
  }

  return { word: match[2] ?? '', start, closing: match[1] === '/' };
}

/** Onde o cursor está escrevendo o valor de um atributo. */
export interface AttributeValueSlot {
  tag: string;
  attribute: string;
  /** O que já foi digitado dentro das aspas. */
  word: string;
  /** Offset em que o valor começa, logo depois da aspa de abertura. */
  start: number;
}

/** `href="` ou `type='`: o nome do atributo e a aspa, colados ao valor. */
const VALUE_HEAD_RE = /([\w:@#.$[\]-]+)\s*=\s*("|')([^"']*)$/;

/**
 * Posição de valor de atributo em que o cursor está, ou `undefined`.
 *
 * Só vale para atributo simples: o valor de `:class` e `@click` é JavaScript, e
 * o de um `{{ }}` no meio das aspas é Liquid — nos dois casos quem completa não
 * é a tabela do HTML.
 */
export function attributeValueSlotAt(text: string, offset: number): AttributeValueSlot | undefined {
  const state = enclosingTag(text, offset);
  if (!state?.quote) {
    return undefined;
  }
  const tag = state.name;

  const match = VALUE_HEAD_RE.exec(text.slice(state.start, offset));
  if (!match || match[2] !== state.quote) {
    return undefined;
  }
  const [, attribute, , word] = match;
  if (/^[:@#]/.test(attribute) || attribute.startsWith('v-')) {
    return undefined;
  }
  const lastOpen = Math.max(word.lastIndexOf('{%'), word.lastIndexOf('{{'));
  const lastClose = Math.max(word.lastIndexOf('%}'), word.lastIndexOf('}}'));
  if (lastOpen > lastClose) {
    return undefined;
  }

  return { tag, attribute, word, start: offset - word.length };
}

/** Nome de elemento numa marcação, com o que vier de atributo depois. */
const ELEMENT_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

/**
 * Elemento aberto mais interno no offset, ou `undefined` se não houver nenhum.
 *
 * É o que `</` completa. A pilha ignora void e self-closing, e um fechamento
 * sem par correspondente é descartado em vez de estourar a pilha: no meio da
 * edição o arquivo passa boa parte do tempo desemparelhado.
 */
export function enclosingElement(text: string, offset: number): string | undefined {
  const stack: string[] = [];
  ELEMENT_RE.lastIndex = 0;

  for (let match = ELEMENT_RE.exec(text); match; match = ELEMENT_RE.exec(text)) {
    if (match.index >= offset) {
      break;
    }
    const [, slash, name, rest] = match;
    if (slash) {
      const at = stack.lastIndexOf(name);
      if (at !== -1) {
        stack.length = at;
      }
      continue;
    }
    if (!rest.trimEnd().endsWith('/') && !VOID_ELEMENTS.has(name.toLowerCase())) {
      stack.push(name);
    }
  }
  return stack[stack.length - 1];
}

/**
 * Tag de fechamento a inserir depois de um `>` recém-digitado, ou `undefined`.
 *
 * `offset` é a posição logo depois do `>`. Fora void, self-closing e o `>` que
 * na verdade é operador dentro de um valor — este último é o motivo de a busca
 * passar por `openTagAt`, que conta aspas, e não por um regex de linha.
 */
export function closingTagFor(text: string, offset: number): string | undefined {
  if (text[offset - 1] !== '>' || text[offset - 2] === '/') {
    return undefined;
  }
  const tag = openTagAt(text, offset - 1);
  if (!tag || VOID_ELEMENTS.has(tag.name.toLowerCase())) {
    return undefined;
  }
  const closing = `</${tag.name}>`;
  // Já fechado logo à frente — o caso de reeditar os atributos de uma tag que
  // já existe, em que inserir de novo deixaria um fechamento órfão.
  return text.startsWith(closing, offset) ? undefined : closing;
}
