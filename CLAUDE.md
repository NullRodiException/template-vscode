# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Extensão do VS Code para arquivos `.template` do Liquid da **Linx Commerce**. Código, comentários, README e changelog estão em português — mantenha.

## Comandos

```bash
npm run build      # esbuild → dist/extension.cjs
npm run watch      # rebuild contínuo
npm run typecheck  # tsc --noEmit (cobre src/ e test/)
npm test           # node --test sobre test/*.test.ts
npm run package    # gera o .vsix (vsce)
```

`npm run build` **antes** de `npm test`: [bundle.test.ts](test/bundle.test.ts) carrega `dist/extension.cjs` com um stub de `vscode` e roda o `activate` real.

Um arquivo de teste só:

```bash
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/scanner.test.ts
node --test --test-name-pattern="raw" --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/core.test.ts
```

Exige Node 22.6+ (`--experimental-strip-types`). `F5` abre o Extension Development Host com a pasta `ex/` carregada.

## Por que o dialeto obriga a código próprio

Não é o Liquid do Shopify: 12 tags proprietárias com argumentos nomeados entre parênteses, `&&`/`null` do C# no `{% if %}`, include sem aspas e sem extensão, filtros exclusivos, e `where:` recebendo Dynamic LINQ dentro de string. Parsers Liquid existentes não abrem esses arquivos.

Duas consequências que atravessam quase todo o código:

1. **`{% raw %}` troca a linguagem dos `{{ }}`** — dentro é mustache do Vue 2, fora é Liquid do servidor. As fronteiras cortam estruturas HTML abertas, e há `{% endraw %}` no meio de valor de atributo.
2. **O Liquid roda antes do HTML** — `<!-- -->` não desativa Liquid, e um `{% endraw %}` dentro de comentário HTML ou de string de atributo vale.

## Arquitetura

### O scanner é a peça central

[src/core/scanner.ts](src/core/scanner.ts) particiona o texto em regiões (`liquid`, `raw`, `liquid-comment`, `script`, `style`, `html-comment`) em duas camadas, com a camada Liquid tendo prioridade absoluta sobre a HTML — é isso que reproduz a ordem de execução do servidor. Comentar, formatar, dobrar, linkar, diagnosticar e completar derivam daqui. Mudança no scanner reverbera em tudo.

[src/core/blocks.ts](src/core/blocks.ts) emparelha os blocos Liquid **uma vez só**; diagnóstico de desbalanceamento, dobra e autocomplete de `{% end… %}` consomem o mesmo resultado, para que um `{% endif %}` não seja erro para um e fechamento válido para outro. Não recrie a pilha em outro lugar.

[src/regionCache.ts](src/regionCache.ts) chaveia as regiões pela versão do documento: uma edição, um `scan()`, para todos os providers. Providers devem chamar `regionsOf(document)`, nunca `scan()` direto.

### `src/core/` é puro — sem `import 'vscode'`

Regra estrutural, não estética: é o que permite testar tudo com `node --test` sem Extension Host. Cada módulo de `core/` tem um adaptador fino fora dele que traduz `TextDocument`/`Uri` para tipos simples — [src/regionCache.ts](src/regionCache.ts), [src/config.ts](src/config.ts), [src/format/provider.ts](src/format/provider.ts), [src/diagnostics.ts](src/diagnostics.ts). Ao acrescentar lógica, ela vai em `core/`; só o registro no editor fica fora.

| Pasta | Conteúdo |
|---|---|
| `src/core/` | scanner, blocos, tags HTML, tabelas do dialeto e do HTML, resolução de caminhos, símbolos, dobra, comentário, diagnósticos — puro |
| `src/format/` | indentador puro + providers de formatação e dobra |
| `src/navigation/` | quick pick, links, definição, símbolos, toggle template↔js, copiar include |
| `syntaxes/` | gramática principal + 3 injeções (raw-escape, liquid, vue-directive) |

### O formatador só mexe na indentação

[src/format/indenter.ts](src/format/indenter.ts) produz no máximo um edit por linha, restrito ao trecho antes do primeiro caractere não-branco. Não é excesso de zelo: a árvore HTML destes arquivos **não é balanceada** (`{% if %}` gera atributos dentro de tag aberta, ramos de `{% if %}/{% else %}` abrem elementos diferentes, há `</span>` órfão). Qualquer abordagem que reconstrua o documento a partir de uma AST quebra. O mesmo emparelhamento tolerante vale na dobra de elementos HTML: fechamento órfão é ignorado, abertura sem par não dobra.

### Dois esquemas de caminho

[src/core/theme.ts](src/core/theme.ts) resolve os dois que convivem no mesmo arquivo:

- **fonte** — `{% include /Pages/... %}`, `| themepath`: igual à árvore local, relativo à raiz do tema.
- **deploy** — `| contentpath`, `template="~/Custom/Content/Widgets/<folder>/..."`: traduzido pelo atributo `folder` do `manifest.xml`.

A raiz do tema é descoberta subindo diretórios até achar uma pasta com `Pages/` ou uma `<site>/html/`. É cacheada, e [extension.ts](src/extension.ts) invalida o cache por `FileSystemWatcher` de `**/manifest.xml` e `**/*.template`.

### Tabela do dialeto

[src/core/liquidTags.ts](src/core/liquidTags.ts) é a fonte única: blocos, tags do meio, as 12 tags Linx com assinatura/doc/exemplo, filtros. Tag nova da Linx entra aqui **antes** de qualquer outra coisa — há um teste de alarme que falha quando o corpus contém uma tag desconhecida, porque a indentação dela não é confiável até estar declarada. [src/core/htmlData.ts](src/core/htmlData.ts) faz o mesmo pelo HTML: o VS Code só liga o serviço de HTML nas linguagens dele, então elementos, atributos e valores são tabelados à mão.

## TypeScript e build

Fontes são **ESM** (imports com extensão `.ts` explícita, `import.meta` nos testes); o esbuild empacota para **CJS** em `dist/extension.cjs`, que é o que o VS Code carrega com `require()`. Mantenha a extensão `.ts` nos imports — `allowImportingTsExtensions` + `moduleResolution: Bundler`.

O modo strip-only do Node não gera código: nada de `enum`, de `namespace` ou de parameter properties (`constructor(public x)`) em `src/` ou `test/`. `verbatimModuleSyntax` está ligado — use `import type` para tipos.

## Testes

Os testes de comportamento rodam sobre o corpus real em `ex/` — código de cliente que **está no `.gitignore` e não vai para o repositório**. [test/helpers.ts](test/helpers.ts) detecta a ausência por um arquivo sentinela e usa `corpusTest`/`corpusDescribe`/`forEachTemplate`, que se declaram *skipped* em vez de derrubar o suite. Casos que precisam de um projeto comum (sem `Pages/`) usam fixtures versionadas em [test/fixtures/](test/fixtures/). Ao acrescentar um teste que dependa de `ex/`, use esses helpers.

[test/grammar.test.ts](test/grammar.test.ts) tokeniza com `vscode-textmate` + `vscode-oniguruma` carregando as gramáticas **embutidas do VS Code instalado** ([test/builtinGrammars.ts](test/builtinGrammars.ts)) — sem o `text.html.basic` real, o caso do `{% endraw %}` dentro de valor de atributo passaria por um caminho que não existe no editor. Pula sozinho se não houver VS Code na máquina. A CI (Node 22, Ubuntu) roda com corpus e gramáticas ausentes: garantias sobre `ex/` não são verificadas lá.

Garantias que os testes de formatação sustentam e que qualquer mudança no indentador precisa preservar: **não-corrupção** (o texto formatado com cada linha em `trim()` é idêntico ao original tratado igual) e **idempotência**.

## Convenções

Comentários explicam **por quê**, não o quê, e citam o arquivo real do corpus que motivou a decisão (`wd.checkout.onepage.template:31`). Vários comportamentos existem por causa de um caso concreto — preserve essas âncoras ao editar.

Comando novo: declarar em `contributes.commands` do [package.json](package.json) **e** registrar no `activate`; [bundle.test.ts](test/bundle.test.ts) confere os dois lados. Configuração nova entra em `contributes.configuration` e é lida por [src/config.ts](src/config.ts).

Cada release atualiza `version` no manifesto e uma seção no [CHANGELOG.md](CHANGELOG.md) descrevendo o problema que a mudança resolve, não só a mudança.
