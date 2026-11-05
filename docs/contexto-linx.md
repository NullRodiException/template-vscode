# Contexto da Linx na extensão

Proposta para a extensão conhecer os objetos que o servidor da Linx entrega ao template — `Config`, `Urls`, `Basket`, `Product`, `Widget`… — e usar isso em autocomplete, hover e diagnóstico, com os dados **da loja de cada tema**.

> Status: proposta. Nada disto está implementado ainda. Os pontos marcados com **(verificar)** são suposições que precisam ser confirmadas contra uma loja real antes de virar código.

## O problema

Hoje a extensão conhece o *dialeto* (tags, filtros, blocos — tudo tabelado em [src/core/liquidTags.ts](../src/core/liquidTags.ts)), mas não conhece os *dados*. Quando alguém digita `{{ Basket.` não há o que sugerir, e um `{{ Basket.Totla }}` passa sem aviso.

Não dá para tabelar esses objetos à mão como foi feito com as tags:

- a Linx não publica um schema dos objetos do contexto;
- o conteúdo muda por loja — `Config` de uma loja tem chaves que a outra não tem, `Urls.BaseUrl` é diferente em cada uma;
- o volume é grande. Contagem de referências no corpus de `ex/`:

| Objeto | Referências |
|---|---:|
| `Widget.` | 3224 |
| `Urls.` | 730 |
| `Item.` | 442 |
| `Product.` | 362 |
| `Basket.` | 325 |
| `ComponentData.` | 323 |
| `Order.` | 182 |
| `Shopper.` | 120 |
| `Model.` | 91 |
| `Customer.` | 89 |
| `Config.` | 84 |

## A ideia central: perguntar à própria loja

O dialeto tem o filtro `| json` ([liquidTags.ts:100](../src/core/liquidTags.ts#L100)), que serializa um objeto inteiro — é como os templates já passam dados do servidor para o Vue (`const configs = {{ Config | json }};`).

Então, em vez de descrever os objetos, a extensão pede para o servidor renderizar um template que os despeja:

```liquid
{
  "Config":   {{ Config | json }},
  "Urls":     {{ Urls | json }},
  "Routes":   {{ Routes | json }},
  "PageInfo": {{ PageInfo | json }},
  "Basket":   {{ Basket | json }},
  "Shopper":  {{ Shopper | json }}
}
```

O servidor executa o Liquid com o contexto real e devolve JSON puro. A extensão lê esse JSON e passa a saber, para aquela loja, quais propriedades existem, de que tipo são e qual o valor atual.

**Relação com o `agd`:** o `agd` já publica um `.agd-context-data.template` em `Shared/`, sem o qual o `agd dev` renderiza com o contexto global vazio. É muito provável que ele já faça exatamente esse dump **(verificar)**. Se fizer, a extensão reaproveita o template e o formato dele, em vez de criar um segundo.

## Como fica dinâmico por loja

Cada tema já carrega a identificação da sua loja em `agrada-liquid.config.json`, na raiz do tema:

```json
{
  "websiteID": 20,
  "liveWidgets": {
    "enabled": true,
    "baseUrl": "https://<loja>.core.dcg.com.br/<tema>",
    "endpoint": "widget",
    "timeoutMs": 8000,
    "cacheTtlMs": 60000
  }
}
```

`liveWidgets.baseUrl` aponta para a loja, e o endpoint `widget` já é usado para renderizar widgets no servidor real. O fluxo:

1. **Achar a raiz do tema** do arquivo aberto. [src/core/theme.ts](../src/core/theme.ts) já faz isso, inclusive num clone com vários temas irmãos.
2. **Ler o `agrada-liquid.config.json`** dessa raiz → `websiteID` e `baseUrl`.
3. **Buscar o dump** na loja, pelo `baseUrl`.
4. **Gravar em cache por loja** — por exemplo `.linx-context/<websiteID>.json` — e usar o cache quando não houver rede.
5. **Comando "Linx: atualizar contexto da loja"** para refazer a busca sob demanda.

Como a resolução parte do arquivo aberto, um repositório com `Base/`, `Moda/` e `agrada-template/` funciona sem configuração: cada arquivo consulta a loja do seu próprio tema.

## Nem todo objeto se obtém do mesmo jeito

O contexto depende de **onde** e **por quem** a página é renderizada:

| Objeto | Depende de | Como obter |
|---|---|---|
| `Config`, `Urls`, `Routes` | nada — é global | uma chamada na home basta |
| `PageInfo` | a rota | uma chamada por tipo de rota |
| `Product`, `Item` | a página | renderizar numa URL de produto |
| `Basket`, `Shopper`, `Customer`, `Order` | a sessão | sem login vêm vazios/nulos; com a sessão do `agd login-customer`, preenchidos |
| `Widget`, `ComponentData` | o widget | renderizar no próprio widget, pelo endpoint de widgets |

Daí uma decisão importante: **guardar a estrutura, não só os valores.** Um carrinho vazio devolve `"Items": []` e esconde o formato de um item. O cache deve acumular a forma (nomes e tipos das propriedades) de cada coleta, para que o autocomplete continue completo mesmo quando a última coleta veio com o carrinho vazio.

## O que a extensão faria com isso

Seguindo a regra do projeto — lógica pura em `src/core/`, só o registro no editor fora:

- **`src/core/context.ts`** (puro): recebe o JSON e monta uma árvore de propriedades com tipo e valor de exemplo; mescla coletas sucessivas; responde "quais filhos tem `Basket.Items[]`?".
- **Adaptador de coleta** (fora de `core/`): lê a config do tema, faz o request, grava o cache.
- **Providers**:
  - *autocomplete* depois de `Config.`, `Basket.`, `Product.`…;
  - *hover* com o tipo e o valor atual na loja;
  - *diagnóstico* para propriedade inexistente (`Basket.Totla`) — com severidade baixa, porque um objeto que não foi coletado não prova que a propriedade não existe.

Configurações novas entram em `contributes.configuration` e são lidas por [src/config.ts](../src/config.ts), como as demais.

## Cuidados

- **`| json` pode não serializar tudo** **(verificar)**. Objetos com referência circular, carregamento sob demanda ou propriedades calculadas podem sair cortados ou derrubar a renderização. Testar objeto por objeto antes de confiar no resultado.
- **Dados pessoais.** `Shopper`, `Customer` e `Order` trazem nome, e-mail e endereço. O cache vai no `.gitignore` e a coleta logada usa um cliente de teste, nunca um cliente real.
- **Credenciais.** A extensão não deve guardar senha nem cookie. O que depende de sessão reaproveita a sessão que o `agd` já mantém.
- **Publicação.** O template de dump precisa estar publicado no tema da loja para o servidor executá-lo. Se o `.agd-context-data.template` já cumpre esse papel, não há nada novo a publicar.

## Ordem sugerida

1. Confirmar o que o `.agd-context-data.template` gera e como o `agd` o chama.
2. Implementar só a parte global: `Config`, `Urls`, `Routes` → `core/context.ts` + cache + autocomplete.
3. Acrescentar hover com valor atual.
4. Estender para os objetos de página e de sessão, com a mescla de estrutura.
5. Por último, o diagnóstico de propriedade inexistente — é o que mais depende de a coleta estar completa.
