# Changelog

## 0.6.0

- **Dobra dos elementos HTML** — `<div>`, `<p>`, `<template>` e companhia passam a dobrar, escondendo até a linha antes do fechamento, que continua visível. Antes só dobravam os blocos Liquid, o `<script>`, o `<style>` e os comentários: num arquivo de 240 linhas de marcação, a única forma de esconder uma seção era a dobra por indentação — que nestes arquivos não bate com a estrutura. Void (`<br>`, `<img>`) e self-closing não abrem faixa, e vale dos dois lados do `{% raw %}`, inclusive dentro de `<script type="text/x-template">`, onde o corpo é marcação. O emparelhamento é tolerante como o do indentador: fechamento órfão é ignorado, abertura sem par não dobra, e a busca não passa de três níveis — a árvore destes arquivos não é balanceada, e sem o teto um `</span>` solto engoliria o arquivo numa faixa só.
- **Copiar o `{% include %}` de um arquivo** — botão direito num `.template` no explorer ou na aba dele, e a área de transferência fica com `{% include /components/index %}`. O caminho conta da raiz do tema, com barra inicial e sem extensão — é o mesmo que o Ctrl+Click resolve de volta, e é o que se montava à mão a cada componente reaproveitado, com o erro só aparecendo quando a página abria sem o trecho. Com vários arquivos selecionados, sai uma linha por include; pela paleta, o alvo é o arquivo aberto.

## 0.5.0

- **Autocomplete de HTML** — digitar `<` passa a oferecer os elementos, e o item escreve a tag inteira: escolher `div` deixa `<div></div>` com o cursor no meio. Depois de `</` vem o fechamento do elemento aberto mais interno. Dentro da tag entram os atributos do próprio elemento (`src`, `alt` e `loading` num `<img>`) seguidos dos globais (`class`, `id`, `role`, `aria-*`, `data-`), e os atributos de lista fechada abrem o menu dos valores já dentro das aspas — `type` de `<input>`, `rel` de `<link>`, `target`, `method`, `loading`. Antes o menu só conhecia `{% %}`, `{{ }}`, filtros, includes e as diretivas do Vue: em `<h1` não vinha nada, porque o serviço de HTML do VS Code só liga nas linguagens dele e `linx-liquid` não é uma delas. Vale dos dois lados do `{% raw %}`, e fica de fora do corpo de `<script>` e `<style>` — ali `a < b` é comparação — exceto no script que carrega template do Vue (`type="text/x-template"`), cujo corpo é marcação.
- **Emmet** — `linx-liquid` entra em `emmet.includeLanguages` pelo manifesto, então `h1` + Tab expande para `<h1></h1>` e `ul>li*3` vira a lista inteira, como num `.html`. Quem já tem um `emmet.includeLanguages` próprio nas configurações do usuário não enxerga esse padrão — o valor do usuário substitui o default inteiro em vez de somar —, e para esse caso **Linx: Configurar workspace** passou a gravar o mapa mesclado no `.vscode/settings.json`.
- **Fechamento automático de tag** — digitar `>` em `<div` escreve `</div>` logo adiante, com o cursor entre as duas. Desliga em `linxLiquid.autoClosingTags`. O `>` que é operador não conta, seja no valor de uma diretiva (`v-if="qtd > 0"`) ou no Liquid (`{% if a > b %}`); void (`<br>`, `<img>`) e self-closing não fecham nada; e uma tag que já tem o fechamento logo à frente não ganha um segundo.

## 0.4.0

- **Autocomplete das diretivas do Vue** — `Ctrl+Space` dentro de uma tag passa a oferecer `v-if`, `v-for`, `v-model` e as demais, mais os atalhos `:class`, `:key`, `@click`, `@submit` e companhia, cada um com a descrição e o exemplo que o hover já mostrava. Antes o menu só conhecia `{% %}`, `{{ }}`, filtros e caminhos de include: em `<h1 :c>` não vinha nada. Cada item substitui o atributo inteiro, sinal incluído — o `wordPattern` da linguagem corta o `:`, e sem isso aceitar `:class` depois de `:c` escreveria `::class`. Vale dentro e fora de `{% raw %}`, como a injeção do realce. `:`, `@`, `#` e `-` viraram gatilhos, então o menu abre sozinho ao digitar.

## 0.3.0

- **Diretivas do Vue** — `v-if`, `v-for`, `v-model`, `:class`, `@click.stop`, `#footer` e as demais passam a ter escopo próprio, com o valor tratado como JavaScript. Antes caíam no atributo genérico do HTML (`meta.attribute.unrecognized.v-if.html`) e a expressão inteira era uma string sem realce nenhum — nos arquivos deste corpus são 268 `v-if`, 218 `@click` e 136 `v-model`. É uma injeção, então vale dentro e fora de `{% raw %}`; o `{{ }}` do Liquid dentro do valor continua sendo Liquid, e um `@click` escrito dentro de uma string comum continua sendo texto.
- **Hover das diretivas** — o que cada uma faz, com exemplo. Nos atalhos, `:x` documenta o `v-bind` e `@x` o `v-on`.

- **Repositório de sites** — a raiz do tema passa a ser reconhecida também como a pasta `<site>/html/`, e não só como a pasta que contém `Pages/`. Sites que só levam `Components/` não tinham raiz nenhuma: `{% include /Components/ProductMedias/index %}` só resolvia quando o arquivo estava na própria `html/`, e `| themepath` não resolvia nunca. A detecção funciona também a partir de arquivos fora da pasta (`src/scss/…`).
- **`Ctrl+Alt+T` com vários sites abertos** — os templates do tema do arquivo aberto vêm primeiro, com o caminho contado a partir da raiz dele (`Components/ProductMedias`), e o título mostra de que site são; o resto do workspace segue depois, com o caminho completo. Num workspace com dezenas de `<site>/html/` a lista era uma mistura de homônimos (`index`, `basket`) sob caminhos longos. `bower_components` entrou na lista de exclusão junto de `node_modules`.

## 0.2.0

### Recursos de linguagem

- **Diagnóstico de bloco Liquid sem fechamento** — `{% if %}` sem `{% endif %}`, `{% for %}` sem `{% endfor %}` e todos os outros pares de `BLOCK_TAGS`, incluindo o caso em que um `end*` de fora denuncia um bloco interno aberto. Um `{% raw %}` desbalanceado suprime a regra, para não gerar cascata em cima da causa única.
- **Diagnóstico de filtro do lado errado do `{% raw %}`** — `| currency` fora de raw (filtro do Vue, que o servidor não conhece) e `| json` dentro de raw (filtro do Liquid, que não roda ali). Só reporta nomes exclusivos de uma das tabelas.
- **Dobra por estrutura** — `{% if %}`, `{% for %}`, `{% capture %}`, `{% raw %}`, `{% comment %}`, `<script>`, `<style>` e comentários HTML passam a dobrar a partir da estrutura real, não da indentação. A dobra por marcador ficou só para `<!-- #region -->`.
- **Go to Definition** — F12 e Peek sobre o caminho de um `{% include %}`, de um `template="…"` ou de um `| themepath`. Antes só havia Ctrl+Click.
- **Outline e breadcrumbs** — `<template id="tpl-…">`, `<script>`, `<style>`, `{% capture %}` e `{% assign %}`.
- **Autocomplete** — `{% end… %}` do bloco aberto mais interno, com a linha da abertura; tags de bloco e neutras junto das 12 da Linx; objetos globais do servidor (`Config`, `Basket`, `Checkout`, `forloop`…) no começo de um `{{ }}` ou de uma expressão.

### Desempenho

- As regiões do documento passam a ser cacheadas por versão. Hover, autocomplete, links, dobra, diagnósticos e formatação compartilham um `scan()` por edição, em vez de um por interação.
- O índice de propriedades `Widget.` saiu de dentro do autocomplete: era um `findFiles` mais até 500 leituras de arquivo com o menu do editor esperando, a cada 30 s. Agora é construído uma vez e invalidado por evento do sistema de arquivos.
- O QuickPick de templates lê os arquivos em paralelo.

### Correções

- Criar ou apagar um `.template` revalida os avisos de include inexistente; antes o aviso ficava pendurado até alguém editar o arquivo.
- Providers que tocam o disco ignoram documentos sem arquivo real por trás (`untitled:` e outros schemes), onde o `fsPath` resolveria contra a pasta errada.
- `Configurar workspace` grava o `editor.defaultFormatter` a partir do id real da extensão, em vez de um literal que quebraria ao mudar o `publisher`.

### Desenvolvimento

- O suite de testes roda num clone sem a pasta `ex/`: os testes que dependem do corpus se declaram pulados, como os de gramática já faziam sem VS Code instalado. Os casos de include fora de um tema Linx passaram a usar fixtures versionadas em `test/fixtures/`.
- CI no GitHub Actions: typecheck, build e testes.
- `@vscode/vsce` entrou nas dependências de desenvolvimento — o script `npm run package` chamava um binário que não estava instalado.

## 0.1.0

Versão inicial: destaque de sintaxe, indentação, comentar bloco, navegação, hover, autocomplete, snippets e diagnósticos de `raw`/`comment`.
