/**
 * Tabela do dialeto Liquid da Linx Commerce.
 *
 * Não existe documentação pública confiável desse dialeto; tudo aqui foi extraído
 * do corpus em `ex/`. Cada entrada de documentação cita o arquivo real de origem.
 */

/** Tags que abrem um bloco e exigem um `end*` correspondente. */
export const BLOCK_TAGS = [
  'if',
  'unless',
  'for',
  'capture',
  'case',
  'tablerow',
  'form',
  'paginate',
] as const;

/** Tags que fecham um bloco, na mesma ordem de BLOCK_TAGS. */
export const END_TAGS = BLOCK_TAGS.map((t) => `end${t}`);

/** Tags que fazem dedent na própria linha sem alterar o nível seguinte. */
export const MIDDLE_TAGS = ['else', 'elsif', 'when'] as const;

/**
 * As 12 tags proprietárias da Linx.
 *
 * Nenhuma abre bloco — todas são singleton. Convivem três formas de argumento:
 * parênteses com args nomeados, string posicional, e sem argumento.
 */
export const LINX_TAGS: Record<string, { signature: string; doc: string; example: string }> = {
  metadata_component: {
    signature: '{% metadata_component(Entity:<expr>, Except:<expr>, Order:<expr>) %}',
    doc: 'Popula `Metadata.MetadataComponentProperties` com os campos da entidade indicada. `Except` recebe uma lista de nomes separados por vírgula a excluir; `Order` define a ordem de exibição.',
    example:
      '{% metadata_component(Entity:entity, Except:fieldsBlocked, Order:Widget.FieldsOrderDisplayedToPerson) %}',
  },
  metadata_for: {
    signature: '{% metadata_for(Entity="<nome>", Only="<campo>", template="<caminho>") %}',
    doc: 'Renderiza um template para campos específicos de uma entidade. O `template` usa caminho de deploy (`~/Custom/Content/Widgets/<folder>/...`).',
    example:
      '{% metadata_for(Entity="Address", Only="State", template="~/Custom/Content/Widgets/checkout.onepage/helpers/input") %}',
  },
  profile_register: {
    signature: '{% profile_register(Entity:<expr>, template="<caminho>") %}',
    doc: 'Renderiza o template de cadastro para a entidade. Usado dentro de `{% capture %}` para montar campos adicionais do formulário.',
    example:
      '{% profile_register(Entity:entity, template="~/Custom/Content/Widgets/checkout.onepage/helpers/register.template") %}',
  },
  browsing_context: {
    signature: '{% browsing_context(forceScript=<bool>) %}',
    doc: 'Emite o contexto de navegação da sessão. `forceScript=false` suprime a tag `<script>` envolvente.',
    example: '{% browsing_context(forceScript=false) %}',
  },
  browsing_context_data: {
    signature: '{% browsing_context_data(Template="<nome>") %}',
    doc: 'Emite os dados do contexto usando um template interno da plataforma (não é um arquivo do tema).',
    example: '{% browsing_context_data(Template="data.basket.item.template") %}',
  },
  page_assets: {
    signature: "{% page_assets '<slot>' %}",
    doc: 'Injeta os assets registrados para o slot. Slots vistos no corpus: `StaticHeaderJavaScript`, `StaticJavaScript`, `PageJavaScript`.',
    example: "{% page_assets 'PageJavaScript' %}",
  },
  page_snippets: {
    signature: "{% page_snippets '<slot>' %}",
    doc: 'Injeta os snippets cadastrados no painel para o slot indicado.',
    example: "{% page_snippets 'footer' %}",
  },
  page_speed: {
    signature: '{% page_speed %}',
    doc: 'Emite o script de medição de performance da página. Vai por último no body.',
    example: '{% page_speed %}',
  },
  system_recaptcha_v3: {
    signature: '{% system_recaptcha_v3 %}',
    doc: 'Emite o script do reCAPTCHA v3 configurado na loja.',
    example: '{% system_recaptcha_v3 %}',
  },
  google_analytics: {
    signature: '{% google_analytics %}',
    doc: 'Emite o script do Google Analytics. Costuma vir guardado por `{% if Config.General.Store.GoogleAnalyticsTracking != null %}`.',
    example: '{% google_analytics %}',
  },
  google_tag_manager: {
    signature: '{% google_tag_manager(ContainerId:<expr>) %}',
    doc: 'Emite o GTM na versão clássica.',
    example: '{% google_tag_manager(ContainerId:Config.General.Store.GoogleTagManager) %}',
  },
  google_tag_manager_newversion: {
    signature: '{% google_tag_manager_newversion(ContainerId:<expr>) %}',
    doc: 'Emite o GTM na versão V2. Selecionado quando `Config.General.Store.GoogleTagManagerWidgetVersion == "V2"`.',
    example: '{% google_tag_manager_newversion(ContainerId:Config.General.Store.GoogleTagManager) %}',
  },
};

/** Filtros server-side, incluindo os exclusivos da Linx. */
export const LINX_FILTERS: Record<string, { signature: string; doc: string; example: string }> = {
  json: {
    signature: '<objeto> | json',
    doc: 'Serializa o objeto como JSON. É como os dados do servidor chegam ao Vue.',
    example: 'const configs = {{ Config | json }};',
  },
  contentpath: {
    signature: "'<caminho>' | contentpath",
    doc: 'Resolve um caminho de **deploy** (`Widgets/<folder>/...`) para a URL pública do CDN de conteúdo.',
    example: "{{ 'Widgets/checkout.onepage/Styles/tailwind.css?v=17' | contentpath }}",
  },
  themepath: {
    signature: "'<caminho>' | themepath",
    doc: 'Resolve um caminho de **fonte** (o mesmo da árvore local, ex. `/Pages/OnePageCheckout/...`) para a URL pública do tema.',
    example: "{{ '/Pages/OnePageCheckout/Scripts/main.js' | themepath }}",
  },
  sitepath: {
    signature: "'<caminho>' | sitepath",
    doc: 'Resolve um caminho relativo à raiz do site.',
    example: "Cdn: \"{{ '/' | sitepath }}\",",
  },
  sharedthemepath: {
    signature: "'<caminho>' | sharedthemepath",
    doc: 'Resolve um caminho no tema compartilhado (`Themes/Shared/`), fora da árvore do widget.',
    example: "{{ 'OnePage/icons/more.svg' | sharedthemepath }}",
  },
  formatdecimal: {
    signature: "<numero> | formatdecimal:'<cultura>'",
    doc: 'Formata um decimal na cultura indicada. Use `en-US` quando o valor for para dentro de JSON, para o separador sair como ponto.',
    example: '"Amount": {{ item.Amount | formatdecimal:"en-US" }},',
  },
  formatdate: {
    signature: "<data> | formatdate:'<formato>'",
    doc: 'Formata uma data com máscara no estilo .NET.',
    example: "{{ Customer.BirthDate | formatdate:'dd-MM-yyyy' }}",
  },
  datetimenow: {
    signature: "'' | datetimenow",
    doc: 'Timestamp atual. Usado para cache-busting de assets.',
    example: "{% assign _ts = '' | datetimenow %}",
  },
  isnullorempty: {
    signature: '<expr> | isnullorempty:"<padrão>"',
    doc: 'Devolve o valor, ou o padrão informado quando o valor é nulo ou vazio.',
    example: 'AddressPerPage: {{ Widget.AddressPerPage | isnullorempty:"null" }},',
  },
  where: {
    signature: "<coleção> | where:'<expressão>'",
    doc: 'Filtra a coleção com uma expressão **Dynamic LINQ / C#** — não é a sintaxe do `where` do Shopify. A expressão vai numa string simples e pode conter aspas duplas.',
    example: "{% assign adyen = Checkout.PaymentGroups | where:'Items.Any(it.Provider == \"ADYEN\")' | first %}",
  },
  select: {
    signature: "<coleção> | select: '<propriedade>'",
    doc: 'Projeta a propriedade indicada de cada item da coleção.',
    example: "{% assign items = Checkout.PaymentGroups | select: 'Items' | firstordefault %}",
  },
  first: {
    signature: '<coleção> | first',
    doc: 'Primeiro item da coleção.',
    example: "{{ Checkout.PaymentGroups | where:'...' | first }}",
  },
  firstordefault: {
    signature: '<coleção> | firstordefault',
    doc: 'Primeiro item da coleção, ou o valor padrão quando ela está vazia. Não estoura em coleção vazia, ao contrário de `first`.',
    example: "{% assign items = Checkout.PaymentGroups | select: 'Items' | firstordefault %}",
  },
  indexat: {
    signature: '<coleção> | indexat:<índice>',
    doc: 'Item da coleção na posição indicada.',
    example:
      '{% assign cheapestGroup = BasketPayment.PaymentGroups | indexat:BasketPayment.CheapestGroupIndex %}',
  },
  concat: {
    signature: '<string> | concat: <valor>',
    doc: 'Concatena strings. No corpus é usado para grudar o timestamp de cache-busting no caminho antes de resolver com `themepath`.',
    example: "{{ '/Pages/OnePageCheckout/Scripts/main.js?v=2' | concat: _ts | themepath }}",
  },
  split: {
    signature: "<string> | split: '<separador>'",
    doc: 'Quebra a string numa coleção.',
    example: '{% assign entities = "Person,Company" | split: "," %}',
  },
  replace: {
    signature: "<string> | replace: '<de>', '<para>'",
    doc: 'Substitui todas as ocorrências. Encadeável.',
    example: "{{ field.InputMask | replace: '9', '#' | replace: '\\*', 'X' }}",
  },
  downcase: {
    signature: '<string> | downcase',
    doc: 'Converte para minúsculas.',
    example: '{% assign inputType = field.InputType | downcase %}',
  },
  plus: {
    signature: '<numero> | plus: <n>',
    doc: 'Soma. Usado para incrementar contadores dentro de `{% for %}`.',
    example: '{% assign cont = cont | plus: 1 %}',
  },
  default: {
    signature: '<expr> | default: <valor>',
    doc: 'Valor padrão quando a expressão é nula, falsa ou vazia.',
    example: '{{ item.Name | default: "sem nome" }}',
  },
};

/** Filtros do Vue 2, válidos apenas dentro de `{% raw %}`. */
export const VUE_FILTERS: Record<string, { signature: string; doc: string; example: string }> = {
  currency: {
    signature: '<numero> | currency',
    doc: 'Formata como moeda. Registrado em `Scripts/helpers/currency.js`. **Filtro do Vue** — só funciona dentro de `{% raw %}`.',
    example: '<span>{{ item.RetailPrice | currency }}</span>',
  },
  cpf: {
    signature: '<string> | cpf',
    doc: 'Aplica a máscara de CPF. **Filtro do Vue.**',
    example: '<li>CPF: {{ customer.Cpf | cpf }}</li>',
  },
  phone: {
    signature: '<string> | phone',
    doc: 'Aplica a máscara de telefone. **Filtro do Vue.**',
    example: '<li>{{ customer?.Contact?.CellPhone | phone }}</li>',
  },
  deliveryTime: {
    signature: '<numero> | deliveryTime',
    doc: 'Formata prazo de entrega em dias. Registrado em `Scripts/helpers/deliveryTime.js`. **Filtro do Vue.**',
    example: '{{ option.TotalDeliveryDays | deliveryTime }}',
  },
};

/** Objetos globais expostos pelo servidor, fora de `{% raw %}`. */
export const GLOBAL_OBJECTS: Record<string, string> = {
  Basket: 'Carrinho atual, com `Items`, `ItemDiscounts`, `SelectedDeliveryOption`, `Total`.',
  BasketPayment: 'Formas de pagamento do carrinho, com `PaymentGroups` e `CheapestGroupIndex`.',
  Checkout: 'Dados do checkout em andamento, com `PaymentGroups`.',
  Customer: 'Cliente logado: `Cpf`, `BirthDate`, `Contact`.',
  Shopper: 'Visitante da sessão, logado ou não.',
  Config: 'Configuração da loja: `Config.General.Store.Name`, `.FavIcon`, `.GoogleTagManager`.',
  ComponentData: 'Dados do componente sendo renderizado. Em `helpers/input.template` é reatribuído a `Metadata`.',
  Metadata: 'Metadados da entidade, com `MetadataComponentProperties` — populado por `{% metadata_component %}`.',
  Widget: 'Propriedades declaradas no `manifest.xml` do widget.',
  Routes: 'Rotas da loja: `Routes.BaseUrl`.',
  Urls: 'URLs da loja: `Urls.BaseUrl`.',
  Response: 'Resposta da última operação do servidor.',
  BusinessContract: 'Contrato comercial vigente.',
  PageInfo: 'Informações da página: `RouteClass`, `BodyClass`.',
  MultiWebsitePlugin: 'Plugins do site: `FeaturePack.IsFacebookLoginEnabled`, `FeaturePack.GoogleClientID`.',
  forloop: 'Estado do `{% for %}` atual: `forloop.last`, `.first`, `.index`.',
};

/**
 * Diretivas do Vue 2, o framework que roda no navegador depois que o servidor
 * entrega o HTML. Aparecem dentro e fora de `{% raw %}`: elas são atributo, não
 * `{{ }}`, então não colidem com a sintaxe do Liquid.
 */
export const VUE_DIRECTIVES: Record<string, { signature: string; doc: string; example: string }> = {
  'v-if': {
    signature: 'v-if="<expressão>"',
    doc: 'Renderiza o elemento só quando a expressão é verdadeira. O elemento **não existe** no DOM quando falsa — ao contrário de `v-show`.',
    example: '<div v-if="Basket.Items.length > 0">',
  },
  'v-else-if': {
    signature: 'v-else-if="<expressão>"',
    doc: 'Encadeia depois de um `v-if`. Precisa ser o elemento imediatamente seguinte.',
    example: '<p v-else-if="carregando">Carregando…</p>',
  },
  'v-else': {
    signature: 'v-else',
    doc: 'Alternativa do `v-if` anterior. Não leva valor, e precisa ser o elemento imediatamente seguinte.',
    example: '<p v-else>Carrinho vazio</p>',
  },
  'v-show': {
    signature: 'v-show="<expressão>"',
    doc: 'Alterna `display: none`. O elemento continua no DOM — use quando alterna muito, e `v-if` quando raramente.',
    example: '<div v-show="aberto">',
  },
  'v-for': {
    signature: 'v-for="<item> in <lista>"',
    doc: 'Repete o elemento para cada item. Com índice: `(item, i) in lista`. Peça sempre um `:key` junto.',
    example: '<li v-for="(item, i) in Basket.Items" :key="item.Id">',
  },
  'v-model': {
    signature: 'v-model="<propriedade>"',
    doc: 'Liga o valor do campo à propriedade nos dois sentidos.',
    example: '<input v-model="Customer.Email">',
  },
  'v-bind': {
    signature: 'v-bind:<atributo>="<expressão>" — atalho `:<atributo>`',
    doc: 'Liga o atributo ao resultado da expressão. Sem ele o valor seria literal.',
    example: '<img :src="item.ImageUrl" :alt="item.Name">',
  },
  'v-on': {
    signature: 'v-on:<evento>="<expressão>" — atalho `@<evento>`',
    doc: 'Escuta o evento. Modificadores comuns: `.prevent`, `.stop`, `.once`, `.enter`.',
    example: '<button @click.prevent="adicionar(item)">',
  },
  'v-html': {
    signature: 'v-html="<expressão>"',
    doc: 'Injeta HTML cru. Não use com conteúdo vindo do usuário — é vetor de XSS.',
    example: '<div v-html="produto.Descricao">',
  },
  'v-text': {
    signature: 'v-text="<expressão>"',
    doc: 'Preenche o texto do elemento. Equivale a `{{ }}` no corpo, e evita o flash do conteúdo antes do Vue montar.',
    example: '<span v-text="total">',
  },
  'v-slot': {
    signature: 'v-slot:<nome> — atalho `#<nome>`',
    doc: 'Nomeia o conteúdo passado para o slot de um componente.',
    example: '<template #footer>',
  },
  'v-cloak': {
    signature: 'v-cloak',
    doc: 'Fica no elemento até o Vue montar. Combinado com `[v-cloak] { display: none }` no CSS, esconde os `{{ }}` crus enquanto a página carrega.',
    example: '<div id="app" v-cloak>',
  },
  'v-once': {
    signature: 'v-once',
    doc: 'Renderiza uma vez e congela: as atualizações seguintes ignoram esta subárvore.',
    example: '<span v-once>{{ Config.General.Store.Name }}</span>',
  },
  'v-pre': {
    signature: 'v-pre',
    doc: 'Deixa o conteúdo intacto: o Vue não compila nada aqui dentro, nem os `{{ }}`.',
    example: '<code v-pre>{{ isto aparece literal }}</code>',
  },
  'v-mask': {
    signature: 'v-mask="\'<máscara>\'"',
    doc: 'Máscara de digitação. **Não é do Vue**: vem da biblioteca `vue-the-mask`, carregada junto do checkout.',
    example: '<input v-mask="\'###.###.###-##\'">',
  },
};

/** Atalhos: o sinal no começo do atributo e a diretiva que ele abrevia. */
const DIRECTIVE_SHORTHANDS: Record<string, string> = {
  ':': 'v-bind',
  '@': 'v-on',
  '#': 'v-slot',
};

/**
 * Nome canônico da diretiva escrita num atributo, ou `undefined` se o atributo
 * não for diretiva.
 *
 * Normaliza as três formas em que a mesma coisa aparece: o atalho (`:class`), a
 * forma longa com argumento (`v-bind:class`) e a com modificadores
 * (`@click.stop.prevent`).
 */
export function directiveName(attribute: string): string | undefined {
  const shorthand = DIRECTIVE_SHORTHANDS[attribute[0]];
  if (shorthand) {
    return attribute.length > 1 ? shorthand : undefined;
  }
  if (!attribute.startsWith('v-')) {
    return undefined;
  }
  // `v-on:change.prevent` ⇒ `v-on`; `v-else-if` continua inteiro.
  const name = attribute.split(/[:.]/)[0];
  return name in VUE_DIRECTIVES ? name : undefined;
}


/**
 * Como cada diretiva entra no arquivo pelo completion, em sintaxe de snippet.
 *
 * O que não está aqui entra como `nome="$1"`, com o cursor já dentro das aspas.
 * As quatro primeiras não levam valor, e `v-for` puxa o `:key` junto porque uma
 * lista sem ele rerenderiza errado — é o erro que mais aparece na revisão.
 */
export const DIRECTIVE_SNIPPETS: Record<string, string> = {
  'v-else': 'v-else',
  'v-cloak': 'v-cloak',
  'v-once': 'v-once',
  'v-pre': 'v-pre',
  'v-bind': 'v-bind:${1:atributo}="${2:expressão}"',
  'v-on': 'v-on:${1:evento}="${2:expressão}"',
  'v-slot': 'v-slot:${1:nome}',
  'v-for': 'v-for="${1:item} in ${2:lista}" :key="${3:item.Id}"',
};

/**
 * Atributos que costumam vir ligados com `:` — `v-bind` com argumento.
 *
 * Não é a lista de atributos do HTML: o `:` aceita qualquer um, inclusive os
 * que um componente inventa. É o conjunto que paga o completion; o resto
 * continua sendo digitado à mão sem perder nada.
 */
export const VUE_BOUND_ATTRIBUTES: Record<string, string> = {
  class: 'classe condicional: objeto `{ ativo: cond }`, array ou string',
  style: 'estilo inline a partir de um objeto',
  key: 'identidade do item dentro de um `v-for`',
  ref: 'nome pelo qual o elemento aparece em `$refs`',
  src: 'origem da imagem, do iframe ou do script',
  href: 'destino do link',
  alt: 'texto alternativo da imagem',
  title: 'tooltip do elemento',
  id: 'id calculado — útil para casar `label[for]` dentro de um `v-for`',
  value: 'valor do campo, quando não se usa `v-model`',
  placeholder: 'texto de exemplo do campo',
  type: 'tipo do input',
  name: 'nome do campo no formulário',
  disabled: 'booleano: o atributo some do HTML quando a expressão é falsa',
  checked: 'booleano do checkbox ou do radio',
  readonly: 'booleano: campo só de leitura',
  selected: 'booleano da option',
};

/** Eventos de DOM mais escutados com `@` — `v-on` com argumento. */
export const VUE_EVENTS: Record<string, string> = {
  click: 'clique; `.prevent` cancela o padrão e `.stop` a propagação',
  dblclick: 'clique duplo',
  submit: 'envio do formulário — quase sempre com `.prevent`',
  input: 'a cada tecla, com o valor já atualizado',
  change: 'ao sair do campo alterado, ou ao trocar a option',
  focus: 'o campo ganhou o foco',
  blur: 'o campo perdeu o foco',
  keyup: 'tecla solta; `.enter` e `.esc` filtram qual',
  keydown: 'tecla pressionada',
  mouseenter: 'o ponteiro entrou no elemento',
  mouseleave: 'o ponteiro saiu do elemento',
  mouseover: 'o ponteiro passou por cima, inclusive dos filhos',
  scroll: 'rolagem do elemento',
  load: 'a imagem ou o iframe terminou de carregar',
  error: 'a imagem falhou — o gancho para trocar por um placeholder',
};

/** Onde o cursor está escrevendo um atributo dentro de uma tag aberta. */
export interface AttributeSlot {
  /** O que já foi digitado, com o sinal: `:c`, `@cli`, `v-i`, ou `''`. */
  word: string;
  /** Offset em que `word` começa — o trecho que o completion substitui. */
  start: number;
}

/** Caracteres que um nome de atributo aceita, incluindo sinal e modificadores. */
const ATTRIBUTE_WORD_RE = /[\w:@#.$[\]-]*$/;

/**
 * Posição de atributo em que o cursor está, ou `undefined` se não for uma.
 *
 * O `wordPattern` da linguagem corta `:` e `@`, então quem completa `:class`
 * precisa saber sozinho onde o atributo começa — senão aceitar a sugestão
 * escreve `::class`. Daí o offset no retorno.
 *
 * Fica de fora tudo que só *parece* posição de atributo: o nome da tag em
 * `<di`, o miolo de um valor entre aspas (ali quem completa é o JavaScript) e
 * o `{% if %}` que aparece no meio da tag, onde os dois-pontos de
 * `where:'x'` não são `v-bind`.
 */
export function attributeSlotAt(text: string, offset: number): AttributeSlot | undefined {
  const before = text.slice(0, offset);
  const open = before.lastIndexOf('<');
  if (open === -1) {
    return undefined;
  }
  const inside = before.slice(open);

  // O `>` que fecha a tag é o que está fora de aspas: em `v-if="qtd > 0"` ele é
  // o operador, e procurar o último `>` do texto daria a tag por fechada bem no
  // meio dela. Aspas ainda abertas no fim significam cursor dentro do valor.
  let quote: string | undefined;
  for (const character of inside) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return undefined;
    }
  }
  if (quote) {
    return undefined;
  }

  // `<div {% if x %}class="a"{% endif %}>`: dentro do Liquid nada aqui vale.
  const lastOpen = Math.max(inside.lastIndexOf('{%'), inside.lastIndexOf('{{'));
  const lastClose = Math.max(inside.lastIndexOf('%}'), inside.lastIndexOf('}}'));
  if (lastOpen > lastClose) {
    return undefined;
  }

  const word = ATTRIBUTE_WORD_RE.exec(inside)?.[0] ?? '';
  const head = inside.slice(0, inside.length - word.length);
  // O nome da tag já veio inteiro e há espaço depois dele: só aí cabe atributo.
  if (!/^<[A-Za-z][\w:.-]*\s/.test(head) || !/\s$/.test(head)) {
    return undefined;
  }
  return { word, start: offset - word.length };
}
const BLOCK_SET: ReadonlySet<string> = new Set<string>(BLOCK_TAGS);
const END_SET: ReadonlySet<string> = new Set<string>(END_TAGS);
const MIDDLE_SET: ReadonlySet<string> = new Set<string>(MIDDLE_TAGS);

export function isBlockTag(name: string): boolean {
  return BLOCK_SET.has(name);
}

export function isEndTag(name: string): boolean {
  return END_SET.has(name);
}

export function isMiddleTag(name: string): boolean {
  return MIDDLE_SET.has(name);
}

/**
 * A qual bloco cada tag do meio pertence.
 *
 * O indentador precisa disso para reencontrar a abertura do bloco quando o ramo
 * anterior deixou HTML aberto em cima dela — em `index.template:6` o
 * `{% else %}` tem duas `<div>` por fechar entre ele e o seu `{% if %}`.
 */
export const MIDDLE_OWNERS: Record<string, readonly string[]> = {
  else: ['if', 'unless', 'case', 'for'],
  elsif: ['if', 'unless'],
  when: ['case'],
};

/** `true` quando `middle` é uma tag do meio válida para o bloco `block`. */
export function ownsMiddle(block: string, middle: string): boolean {
  return MIDDLE_OWNERS[middle]?.includes(block) ?? false;
}

/**
 * Tags conhecidas que deliberadamente não mexem na indentação.
 * `raw`/`endraw` entram aqui: 19 dos 27 arquivos do corpus são envoltos em raw
 * inteiro, então contá-los indentaria o arquivo todo um nível à toa.
 */
export const NEUTRAL_TAGS: ReadonlySet<string> = new Set([
  'raw',
  'endraw',
  'comment',
  'endcomment',
  'assign',
  'include',
  'render',
  'layout',
  'section',
  'echo',
  'increment',
  'decrement',
  'break',
  'continue',
  'cycle',
  'liquid',
  ...Object.keys(LINX_TAGS),
]);

/** Elementos HTML sem tag de fechamento. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
  '!doctype',
]);
