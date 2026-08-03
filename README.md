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

### Indentação e formatação

**O formatador só mexe na indentação.** Cada linha produz no máximo um edit, restrito ao trecho antes do primeiro caractere não-branco — é estruturalmente impossível corromper o arquivo.

A restrição não é excesso de zelo: a árvore HTML destes arquivos não é balanceada. `{% if %}` gera atributos dentro de uma tag aberta, os ramos de um `{% if %}/{% else %}` produzem elementos diferentes, e existe `</span>` sem par. Um formatador que reconstrói o documento a partir de uma AST quebra nesses casos.

Ficam intocados: o corpo de `<script>` e `<style>`, mustaches do Vue quebrados em várias linhas, e o interior de comentários.

Além do formatador, `indentationRules` e `onEnterRules` dão indentação automática enquanto você digita, e os blocos Liquid e `{% raw %}` podem ser dobrados.

### Comentar bloco — `Ctrl+/`

Sempre insere `{% comment %}` / `{% endcomment %}`, que é a única sintaxe que realmente neutraliza código do servidor. `<!-- -->` **não desativa Liquid** — o Liquid roda antes do HTML.

A contrapartida: dentro de `{% raw %}` o `{% comment %}` não é processado e o conteúdo continua sendo renderizado. Quando isso acontece, a extensão avisa na hora e oferece um Quick Fix para converter em `<!-- -->`.

Pressionar de novo com o cursor dentro do bloco descomenta.

### Navegação

| Atalho | O que faz |
|---|---|
| `Ctrl+Alt+T` | Lista todos os `.template` do workspace, agrupados por pasta |
| `Ctrl+Click` | Abre o arquivo de um `{% include %}`, de um `template="…"` ou de um `\| themepath` |
| `Alt+O` | Alterna entre `components/X.template` e `Scripts/components/X.js` |

O Ctrl+Click resolve os dois esquemas de caminho que convivem no projeto: o de **fonte** (`/Pages/OnePageCheckout/…`, igual à árvore local) e o de **deploy** (`~/Custom/Content/Widgets/<folder>/…`), traduzido pelo atributo `folder` do `manifest.xml`.

### Diagnósticos

| Regra | Severidade |
|---|---|
| `{% raw %}` ou `{% comment %}` sem fechamento | Erro — o resto do arquivo vai renderizado como texto cru |
| `{% comment %}` dentro de `{% raw %}` | Aviso, com Quick Fix para `<!-- -->` |
| Tag Liquid ativa dentro de comentário HTML | Informação — o comentário não impede a execução |
| `{% include %}` para arquivo inexistente | Aviso |

### Hover, autocomplete e snippets

Passar o mouse sobre as tags e filtros da Linx mostra assinatura, descrição e um exemplo real. O autocomplete oferece os caminhos de `{% include %}` e as propriedades de `{{ Widget. }}` — unindo as declaradas no `manifest.xml` com as efetivamente usadas nos templates, porque as duas listas costumam divergir.

Snippets: `lxcomponent` (esqueleto de componente novo), `forjson` (laço gerando array JSON dentro de `<script>`), e um para cada tag proprietária.

## Configuração

| Opção | Padrão | Para quê |
|---|---|---|
| `linxLiquid.themeRoot` | detecção automática | Raiz do tema (a pasta que contém `Pages/`). Só defina se a detecção falhar |
| `linxLiquid.sharedThemeRoot` | vazio | Raiz do tema compartilhado, para o filtro `\| sharedthemepath` |
| `linxLiquid.diagnostics.enabled` | `true` | Liga/desliga os diagnósticos |
| `linxLiquid.format.attributeIndent` | `oneLevel` | `preserve` mantém as linhas de continuação de atributo como estão |

Formatar ao salvar vem **desligado**. Para ligar só nesta linguagem e só neste workspace, rode **Linx: Configurar workspace** na paleta de comandos.

Tab ou espaço vem do próprio editor (`editor.detectIndentation`), então cada arquivo mantém o estilo que já tinha — útil num projeto onde a indentação é inconsistente.

## Desenvolvimento

```bash
npm install
npm run build      # bundle em dist/extension.cjs
npm run watch      # rebuild contínuo
npm test           # 146 testes
npm run typecheck
```

`F5` abre o Extension Development Host já com a pasta `ex/` carregada.

### Sobre os testes

Rodam sobre os 27 arquivos `.template` reais em `ex/`, não sobre fixtures inventadas. As garantias mais importantes:

- **Não-corrupção** — para cada arquivo, o texto formatado com cada linha passada por `trim()` tem que ser idêntico ao original com o mesmo tratamento. Prova que nada além da indentação mudou.
- **Idempotência** — formatar duas vezes é igual a formatar uma vez.
- **Alarme de dialeto** — se a Linx introduzir uma tag nova, o teste falha e aponta que ela precisa entrar em `src/core/liquidTags.ts` antes de se confiar na indentação dela.
- **Gramática** — tokeniza com `vscode-textmate` e `vscode-oniguruma`, carregando as gramáticas embutidas do VS Code instalado. Sem o `text.html.basic` real, o caso do `{% endraw %}` dentro de um valor de atributo passaria por um caminho que não existe no editor; esses testes se declaram pulados se não houver VS Code na máquina.

### Organização

```
src/core/       scanner de regiões, tabela do dialeto, resolução de caminhos,
                comentário e diagnósticos — tudo puro, sem importar 'vscode'
src/format/     indentador (puro) + providers
src/navigation/ quick pick, document links, toggle template↔js
syntaxes/       gramática principal + duas injeções
```

O scanner de `src/core/scanner.ts` é a peça central: particiona o arquivo em regiões (`liquid`, `raw`, `liquid-comment`, `script`, `style`, `html-comment`) reproduzindo a ordem real de execução do servidor. Comentar, formatar, linkar e diagnosticar derivam dele.

## Nota sobre a extensão `.template`

A extensão registra `.template` globalmente. Se isso conflitar com outro projeto, reverta por workspace:

```json
{ "files.associations": { "*.template": "plaintext" } }
```
