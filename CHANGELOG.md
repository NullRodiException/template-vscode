# Changelog

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
