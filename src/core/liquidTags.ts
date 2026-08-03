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
