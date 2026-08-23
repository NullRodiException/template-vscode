# Linx Liquid Template

Suporte a arquivos `.template` do Liquid da **Linx Commerce** no VS Code: destaque de sintaxe, indentação, comentar bloco, navegação e diagnósticos.

## Por que não usar uma extensão Liquid do marketplace

Este não é o Liquid do Shopify. O dialeto da Linx diverge em pontos que quebram os parsers existentes:

- **12 tags proprietárias** com sintaxe de parênteses e argumentos nomeados — `{% metadata_component(Entity:entity, Except:fieldsBlocked) %}`, `{% browsing_context(forceScript=false) %}`
- `{% if %}` aceita `&&` do C#, e usa `null` em vez de `nil`
- `{% include /Pages/OnePageCheckout/components/basket %}` — caminho **sem aspas e sem extensão**
- Filtros exclusivos: `contentpath`, `themepath`, `sharedthemepath`, `formatdecimal`, `datetimenow`, `indexat`, `isnullorempty`, `firstordefault`
- O filtro `where` recebe **Dynamic LINQ / C#** dentro de uma string: `where:'Items.Any(it.Provider == "ADYEN")'`

Na prática, o `@shopify/prettier-plugin-liquid` não parseia esses arquivos.

E há uma dificuldade maior: **`{% raw %}` troca a linguagem dos `{{ }}`**. Dentro dele são mustaches do Vue 2, com filtros próprios (`| currency`, `| cpf`, `| phone`); fora, são Liquid do servidor. As fronteiras cortam estruturas HTML abertas — um `<form>` pode abrir dentro de raw e fechar depois de um bloco Liquid inteiro, e há `{% endraw %}` no meio de um valor de atributo.

## O que a extensão faz

### Destaque de sintaxe

Gramática própria que modela a alternância raw ↔ Liquid, com uma injeção que alcança o Liquid preso dentro de strings de atributo, comentários HTML e blocos `<script>` — lugares onde a gramática HTML padrão captura o scanner e o Liquid deixaria de ser reconhecido.

Distingue o filtro `| currency` do `||` do JavaScript, e trata `{% comment %}` como região opaca (no corpus há um par `{% capture %}/{% endcapture %}` inteiro comentado).

As **diretivas do Vue** têm escopo próprio, dentro e fora de `{% raw %}`: `v-if`, `v-for`, `:class`, `@click.prevent`, `#footer`. O valor delas é tratado como JavaScript — sem isso, `v-if="Basket.Items.length > 0"` era uma string monocromática, igual a um `data-x` qualquer. O `{{ }}` do Liquid dentro do valor continua sendo Liquid.

### Indentação e formatação

**O formatador só mexe na indentação.** Cada linha produz no máximo um edit, restrito ao trecho antes do primeiro caractere não-branco — é estruturalmente impossível corromper o arquivo.

A restrição não é excesso de zelo: a árvore HTML destes arquivos não é balanceada. `{% if %}` gera atributos dentro de uma tag aberta, os ramos de um `{% if %}/{% else %}` produzem elementos diferentes, e existe `</span>` sem par. Um formatador que reconstrói o documento a partir de uma AST quebra nesses casos.

Ficam intocados: o corpo de `<script>` e `<style>`, mustaches do Vue quebrados em várias linhas, e o interior de comentários.

**Salvar formata.** Não é preciso configurar nada: a extensão indenta o arquivo no save, em qualquer máquina, e `linxLiquid.format.onSave` desliga. Quem já tem `editor.formatOnSave` ligado para a linguagem continua com o formatador do editor — a extensão sai de cena em vez de aplicar tudo duas vezes.

Fechar uma estrutura também formata na hora: digitar o `>` de `</div>` ou o `}` de `{% endif %}` traz a linha de volta ao nível da abertura, sem esperar o save. O `indentationRules` só age no Enter, quando o fechamento ainda não foi escrito, então até aqui a linha nascia um nível adentro e ficava.

### Dobra

As faixas dobráveis saem da estrutura real, não da indentação — que nestes arquivos não é confiável. Dobram `{% if %}`, `{% for %}`, `{% capture %}` e os demais blocos, mais `{% raw %}`, `{% comment %}`, `<script>`, `<style>` e comentários HTML. Um bloco sem fechamento não dobra: sem o `end*` não há como saber onde a faixa terminaria, e é o diagnóstico que reporta o problema.

Os **elementos HTML** também dobram: `<div>` esconde até a linha antes do `</div>`, que continua visível. Void (`<br>`, `<img>`) e self-closing não abrem faixa, e vale dos dois lados do `{% raw %}` — inclusive dentro de um `<script type="text/x-template">`, onde o corpo é marcação. A árvore destes arquivos não é balanceada (os ramos de um `{% if %}` abrem elementos diferentes, e há `</span>` órfão no corpus), então o emparelhamento é tolerante: um fechamento sem abertura à vista é ignorado e uma abertura sem par simplesmente não dobra, em vez de desalinhar o resto do arquivo.

### Comentar bloco — `Ctrl+/`

Sempre insere `{% comment %}` / `{% endcomment %}`, que é a única sintaxe que realmente neutraliza código do servidor. `<!-- -->` **não desativa Liquid** — o Liquid roda antes do HTML.

A contrapartida: dentro de `{% raw %}` o `{% comment %}` não é processado e o conteúdo continua sendo renderizado. Quando isso acontece, a extensão avisa na hora e oferece um Quick Fix para converter em `<!-- -->`.

Pressionar de novo com o cursor dentro do bloco descomenta.

### Navegação

| Atalho | O que faz |
|---|---|
| `Ctrl+Alt+T` | Lista todos os `.template` do workspace, agrupados por pasta, começando pelo tema do arquivo aberto |
| `Ctrl+Click` ou `F12` | Abre o arquivo de um `{% include %}`, de um `template="…"` ou de um `\| themepath` |
| `Alt+O` | Alterna entre `components/X.template` e `Scripts/components/X.js` |

A resolução cobre os esquemas de caminho que convivem no projeto: o de **fonte** (`/Pages/OnePageCheckout/…`, igual à árvore local) e os dois de **deploy** — `~/Custom/Content/Widgets/<folder>/…`, traduzido pelo atributo `folder` do `manifest.xml`, e `~/Custom/Content/Themes/<tema>/…`, onde `<tema>` é a pasta do tema irmão. O segundo não passa por manifesto nenhum, e é o que resolve num clone que não tem `manifest.xml`. `F12` e `Alt+F12` (Peek) usam o mesmo resolvedor do Ctrl+Click.

A raiz de onde esses caminhos contam é descoberta subindo os diretórios: a pasta que contém `Pages/` no widget avulso, a `<site>/html/` no repositório de sites — inclusive nos sites que só têm `Components/`, e a partir de arquivos fora dela (`src/scss/…`, por exemplo) — e, num repositório de temas com `Base/`, `Moda/` e `Shared/` lado a lado, a pasta do tema que tem `Templates/`, `Components/` ou `Configs/`. Esse último sinal é fraco de propósito: só entra quando não há `Pages/` nem `html/` em toda a subida, e nunca acima das pastas abertas no workspace.

O Outline e os breadcrumbs listam os `<template id="tpl-…">`, os `<script>`/`<style>` e os `{% capture %}`/`{% assign %}` — o que se procura num arquivo de 240 linhas.

### Copiar o `{% include %}` de um arquivo

Botão direito num `.template` no explorer (ou na aba dele) → **Copiar `{% include %}` do arquivo**, e a área de transferência fica com a tag pronta:

```
<site>/html/components/index.template   ⇒   {% include /components/index %}
```

É o mesmo caminho que o Ctrl+Click resolve de volta: conta da raiz do tema, com barra inicial e sem a extensão, que é o servidor quem recoloca. Selecionando vários arquivos, sai uma linha por include. Pela paleta de comandos o alvo é o arquivo aberto.

### Diagnósticos

| Regra | Severidade |
|---|---|
| `{% raw %}` ou `{% comment %}` sem fechamento | Erro — o resto do arquivo vai renderizado como texto cru |
| Bloco Liquid sem fechamento (`{% if %}` sem `{% endif %}`) ou `end*` órfão | Erro |
| `{% comment %}` dentro de `{% raw %}` | Aviso, com Quick Fix para `<!-- -->` |
| Filtro do lado errado do `{% raw %}` (`\| currency` fora, `\| json` dentro) | Aviso |
| Tag Liquid ativa dentro de comentário HTML | Informação — o comentário não impede a execução |
| `{% include %}` para arquivo inexistente | Aviso |

Um `{% raw %}` desbalanceado suprime a checagem de blocos: sem o `{% endraw %}` metade do arquivo troca de linguagem, e reportar blocos em cima disso esconderia a causa única.

### Hover, autocomplete e snippets

Passar o mouse sobre as tags e filtros da Linx mostra assinatura, descrição e um exemplo real. O mesmo vale para as diretivas do Vue — inclusive nos atalhos, em que `:class` documenta o `v-bind` e `@click` o `v-on`. O autocomplete oferece:

- os caminhos de `{% include %}`;
- as propriedades de `{{ Widget. }}` — unindo as declaradas no `manifest.xml` com as efetivamente usadas nos templates, porque as duas listas costumam divergir;
- o `{% end… %}` do bloco aberto mais interno, com a linha em que ele abriu;
- as tags do dialeto e os objetos globais do servidor (`Config`, `Basket`, `Checkout`, `forloop`…), sempre respeitando a fronteira do `{% raw %}` — dentro dele nada disso existe;
- os elementos de HTML depois do `<`, escrevendo a tag inteira (`<div></div>`, com o cursor no meio), e o fechamento do elemento aberto mais interno depois do `</`;
- os atributos do elemento, seguidos dos globais (`class`, `id`, `role`, `aria-*`, `data-`) e das diretivas do Vue, e os valores de lista fechada (`type` de `<input>`, `rel` de `<link>`, `target`, `method`, `loading`) já dentro das aspas.

O HTML fica de fora do corpo de `<script>` e `<style>`, onde `a < b` é comparação e não abertura de tag — menos no script que carrega template do Vue (`type="text/x-template"`), cujo corpo é marcação.

Emmet vem ligado para a linguagem: `h1` + Tab expande para `<h1></h1>`, e `ul>li*3` vira a lista inteira. Se você já tem um `emmet.includeLanguages` próprio nas suas configurações, ele substitui o padrão da extensão inteiro — rode **Linx: Configurar workspace** e o mapa mesclado vai para o `.vscode/settings.json`.

Digitar `>` fecha a tag sozinho (`<div` vira `<div></div>` com o cursor no meio), o que o VS Code só faz nas linguagens do serviço de HTML. `linxLiquid.autoClosingTags` desliga.

Snippets: `lxcomponent` (esqueleto de componente novo), `forjson` (laço gerando array JSON dentro de `<script>`), e um para cada tag proprietária.

### Ícone dos arquivos

Os `.template` têm ícone próprio no explorer e nas abas, em duas cores — uma para tema claro, outra para escuro.

Quem decide se ele aparece é o tema de ícones ativo: o VS Code só gera a regra da linguagem para temas que declaram associações próprias e não desligam `showLanguageModeIcons`. O **Seti**, padrão do editor, entra nesse caso. Temas de ícone único, como o **Minimal**, mostram o documento em branco de sempre.

## Configuração

| Opção | Padrão | Para quê |
|---|---|---|
| `linxLiquid.themeRoot` | detecção automática | Raiz do tema (a pasta que contém `Pages/`, a `html/` do site, ou a pasta do tema num repositório de temas). Absoluta ou relativa à pasta do workspace. Só defina se a detecção falhar |
| `linxLiquid.sharedThemeRoot` | vazio | Raiz do tema compartilhado, para o filtro `\| sharedthemepath` |
| `linxLiquid.diagnostics.enabled` | `true` | Liga/desliga os diagnósticos |
| `linxLiquid.format.onSave` | `true` | Indenta ao salvar. Independe de `editor.formatOnSave` |
| `linxLiquid.format.attributeIndent` | `oneLevel` | `preserve` mantém as linhas de continuação de atributo como estão |
| `linxLiquid.autoClosingTags` | `true` | Digitar `>` escreve a tag de fechamento |

Formatar ao salvar vem **ligado**, por conta da própria extensão. **Linx: Configurar workspace** continua útil para dois casos: passar a formatação para o pipeline do editor (`editor.formatOnSave` + `editor.defaultFormatter` no `.vscode/settings.json`), e destravar a formatação enquanto se digita para quem tem um `editor.formatOnType` próprio nas configurações do usuário — o padrão do manifesto não vence uma configuração explícita.

Tab ou espaço vem do próprio editor (`editor.detectIndentation`), então cada arquivo mantém o estilo que já tinha — útil num projeto onde a indentação é inconsistente. No save de uma aba que não está à vista não há editor para consultar, e aí o estilo é deduzido do próprio texto, pelo mesmo motivo: um arquivo de tab não pode virar espaço porque foi salvo em segundo plano.

## Desenvolvimento

```bash
npm install
npm run build      # bundle em dist/extension.cjs (rode antes de npm test)
npm run watch      # rebuild contínuo
npm test
npm run typecheck
npm run package    # gera o .vsix
```

`F5` abre o Extension Development Host já com a pasta `ex/` carregada.

### Sobre os testes

Os testes de comportamento rodam sobre os 27 arquivos `.template` reais em `ex/`, não sobre fixtures inventadas.

**`ex/` não vai para o repositório** — é código de cliente, e está no `.gitignore`. Num clone sem essa pasta, os testes que dependem dela se declaram *skipped* em vez de derrubar o suite; os que usam strings inline continuam rodando, e é essa parte que a CI verifica. Os poucos casos que precisavam de um projeto comum (sem `Pages/`, e portanto sem raiz de tema) usam fixtures versionadas em `test/fixtures/`.

As garantias mais importantes:

- **Não-corrupção** — para cada arquivo, o texto formatado com cada linha passada por `trim()` tem que ser idêntico ao original com o mesmo tratamento. Prova que nada além da indentação mudou.
- **Idempotência** — formatar duas vezes é igual a formatar uma vez.
- **Alarme de dialeto** — se a Linx introduzir uma tag nova, o teste falha e aponta que ela precisa entrar em `src/core/liquidTags.ts` antes de se confiar na indentação dela.
- **Gramática** — tokeniza com `vscode-textmate` e `vscode-oniguruma`, carregando as gramáticas embutidas do VS Code instalado. Sem o `text.html.basic` real, o caso do `{% endraw %}` dentro de um valor de atributo passaria por um caminho que não existe no editor; esses testes se declaram pulados se não houver VS Code na máquina.

### Organização

```
src/core/       scanner de regiões, emparelhamento de blocos, varredura de tags
                HTML, tabela do dialeto, tabela do HTML, resolução de caminhos,
                símbolos, dobra, comentário e diagnósticos — tudo puro, sem
                importar 'vscode'
src/format/     indentador (puro) + providers de formatação e dobra
src/navigation/ quick pick, links, definição, símbolos, toggle template↔js,
                copiar include
syntaxes/       gramática principal + duas injeções
```

O scanner de `src/core/scanner.ts` é a peça central: particiona o arquivo em regiões (`liquid`, `raw`, `liquid-comment`, `script`, `style`, `html-comment`) reproduzindo a ordem real de execução do servidor. Comentar, formatar, dobrar, linkar e diagnosticar derivam dele.

Em cima dele, `src/core/blocks.ts` emparelha os blocos Liquid uma vez só, e os três consumidores que precisam dessa pilha — diagnóstico de desbalanceamento, dobra e autocomplete de `{% end… %}` — compartilham o resultado. Se cada um mantivesse a sua, o mesmo `{% endif %}` poderia ser erro para um e fechamento válido para outro.

`src/regionCache.ts` guarda as regiões por versão do documento: uma edição, um `scan()`, para todos os providers.

## Nota sobre a extensão `.template`

A extensão registra `.template` globalmente. Se isso conflitar com outro projeto, reverta por workspace:

```json
{ "files.associations": { "*.template": "plaintext" } }
```
