/**
 * Testes da gramática TextMate.
 *
 * Tokeniza os arquivos reais com o mesmo motor do VS Code (vscode-textmate +
 * vscode-oniguruma), carregando também as gramáticas embutidas do editor, e
 * afirma os escopos exatos nos pontos onde a alternância raw↔Liquid é difícil.
 * É o único jeito de provar o highlight sem abrir o editor e olhar.
 */

import { test, describe, before, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

import type { IGrammar } from 'vscode-textmate';

import { REPO_ROOT, read, lineAt, corpusDescribe } from './helpers.ts';
import { builtinGrammars } from './builtinGrammars.ts';

// Os dois pacotes são CommonJS; o namespace ESM não expõe as funções direto.
const require = createRequire(import.meta.url);
const oniguruma = require('vscode-oniguruma');
const textmate = require('vscode-textmate');

const MAIN_SCOPE = 'text.html.linx-liquid';

const OWN_GRAMMARS: Record<string, string> = {
  [MAIN_SCOPE]: 'syntaxes/linx-liquid.tmLanguage.json',
  'linx-liquid.injection.raw-escape': 'syntaxes/raw-escape.injection.json',
  'linx-liquid.injection.liquid': 'syntaxes/liquid.injection.json',
  'linx-liquid.injection.vue-directive': 'syntaxes/vue-directive.injection.json',
};

let grammar: IGrammar | null;
/** Sem VS Code instalado não há `text.html.basic`, e alguns testes deixam de ser fiéis. */
let hasBuiltins = false;

before(async () => {
  const wasmPath = path.join(REPO_ROOT, 'node_modules/vscode-oniguruma/release/onig.wasm');
  const wasm = fs.readFileSync(wasmPath);
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));

  const builtins = builtinGrammars();
  hasBuiltins = builtins.has('text.html.basic');

  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
      createOnigString: (s: string) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scopeName: string) => {
      const own = OWN_GRAMMARS[scopeName];
      if (own) {
        return textmate.parseRawGrammar(fs.readFileSync(path.join(REPO_ROOT, own), 'utf8'), own);
      }
      const builtin = builtins.get(scopeName);
      if (builtin) {
        return textmate.parseRawGrammar(fs.readFileSync(builtin, 'utf8'), builtin);
      }
      return null;
    },
    getInjections: (scopeName: string) =>
      scopeName === MAIN_SCOPE
        ? [
            'linx-liquid.injection.raw-escape',
            'linx-liquid.injection.liquid',
            'linx-liquid.injection.vue-directive',
          ]
        : undefined,
  });

  grammar = await registry.loadGrammar(MAIN_SCOPE);
  assert.ok(grammar, 'a gramática principal deve carregar');
});

interface Token {
  line: number;
  start: number;
  end: number;
  text: string;
  scopes: string[];
}

/** Tokeniza o documento inteiro, preservando o estado entre as linhas. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let state = textmate.INITIAL;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const result = grammar!.tokenizeLine(line, state);
    for (const token of result.tokens) {
      out.push({
        line: i + 1,
        start: token.startIndex,
        end: token.endIndex,
        text: line.slice(token.startIndex, token.endIndex),
        scopes: token.scopes,
      });
    }
    state = result.ruleStack;
  }
  return out;
}

/**
 * Escopos do token que cobre a primeira ocorrência de `needle` na linha.
 *
 * Localiza pela coluna, não pelo conteúdo do token: com a gramática HTML real
 * carregada a tokenização fica fina, e `Urls.BaseUrl` vira vários tokens.
 */
function scopesAt(tokens: Token[], sourceText: string, line: number, needle: string): string[] {
  const column = lineAt(sourceText, line).indexOf(needle);
  assert.notEqual(column, -1, `a linha ${line} não contém "${needle}"`);

  const token = tokens.find((t) => t.line === line && t.start <= column && column < t.end);
  assert.ok(token, `nenhum token cobre a coluna ${column} da linha ${line}`);
  return token.scopes;
}

function hasScope(scopes: string[], prefix: string): boolean {
  return scopes.some((s) => s === prefix || s.startsWith(`${prefix}.`));
}

/**
 * `true` quando quem tokenizou o trecho foi a gramática do JavaScript.
 *
 * O `include: source.js` não deixa um escopo `source.js` na pilha — como no
 * `<script>` do próprio HTML, o que aparece são os escopos das regras dela
 * (`variable.other.object.js`, `keyword.operator.….js`).
 */
function isJavaScript(scopes: string[]): boolean {
  return scopes.some((s) => s.endsWith('.js'));
}

/** Consultor de escopos por linha/trecho sobre um texto qualquer. */
function inspectText(text: string) {
  const tokens = tokenize(text);
  return {
    text,
    tokens,
    scopes: (line: number, needle: string) => scopesAt(tokens, text, line, needle),
    /** `true` se algum token da linha tem o escopo. */
    lineHas: (line: number, prefix: string) =>
      tokens.some((t) => t.line === line && hasScope(t.scopes, prefix)),
  };
}

/** Lê um arquivo do corpus e devolve o mesmo consultor. */
function inspect(file: string) {
  return inspectText(read(file));
}

describe('gramática — diretivas do Vue', () => {
  /**
   * Fonte inline, não o corpus: as diretivas são o que mais aparece nos arquivos
   * do dia a dia, e a cobertura precisa valer também num clone sem `ex/`.
   *
   * Sem a `text.html.basic` de verdade não existe o escopo `meta.tag` em que a
   * injeção se pendura — sem ela o teste não testaria nada.
   */
  function inspectTag(t: TestContext, source: string): ReturnType<typeof inspectText> | undefined {
    if (!hasBuiltins) {
      t.skip('sem VS Code instalado, text.html.basic não carrega e a injeção não tem onde entrar');
      return undefined;
    }
    return inspectText(source);
  }

  test('o nome da diretiva é keyword e o valor é JavaScript, não string', (t) => {
    const html = inspectTag(t, '{% raw %}\n<div v-if="Basket.Items.length > 0"></div>\n{% endraw %}');
    if (!html) {
      return;
    }
    assert.ok(hasScope(html.scopes(2, 'v-if'), 'keyword.control.directive.vue'));
    assert.ok(
      hasScope(html.scopes(2, 'Basket'), 'meta.embedded.expression.vue'),
      'o valor é expressão embutida',
    );
    assert.ok(isJavaScript(html.scopes(2, 'Basket')), 'com o JavaScript real dentro');
    assert.ok(
      !hasScope(html.scopes(2, 'Basket'), 'string.quoted'),
      'sem a regra, o valor inteiro era uma string só',
    );
  });

  test(': e @ separam o sinal do argumento', (t) => {
    const html = inspectTag(t, '<button :class="{ ativo: on }" @click="fechar()"></button>');
    if (!html) {
      return;
    }
    assert.ok(hasScope(html.scopes(1, ':class'), 'keyword.control.directive.vue'), 'o : é o sinal');
    assert.ok(hasScope(html.scopes(1, 'class="'), 'entity.other.attribute-name.vue'));
    assert.ok(hasScope(html.scopes(1, '@'), 'keyword.control.directive.vue'));
    assert.ok(hasScope(html.scopes(1, 'click'), 'entity.other.attribute-name.vue'));
    assert.ok(hasScope(html.scopes(1, 'fechar'), 'entity.name.function.js'), 'a chamada é JS');
  });

  test('argumento e modificadores de v-on:change.prevent', (t) => {
    const html = inspectTag(t, '<input v-on:change.stop.prevent="salvar" @keyup.enter="ok">');
    if (!html) {
      return;
    }
    assert.ok(hasScope(html.scopes(1, 'v-on'), 'keyword.control.directive.vue'));
    assert.ok(hasScope(html.scopes(1, 'change'), 'entity.other.attribute-name.vue'));
    assert.ok(
      hasScope(html.scopes(1, '.stop.prevent'), 'entity.other.attribute-name.modifier.vue'),
      'a cadeia de modificadores sai num token só',
    );
    assert.ok(hasScope(html.scopes(1, '.enter'), 'entity.other.attribute-name.modifier.vue'));
  });

  test('v-for: o in é operador e os aliases são variáveis', (t) => {
    const html = inspectTag(t, '<li v-for="(item, i) in Basket.Items" :key="item.Id"></li>');
    if (!html) {
      return;
    }
    assert.ok(hasScope(html.scopes(1, 'item,'), 'variable.other'), 'o alias é variável');
    assert.ok(hasScope(html.scopes(1, 'in Basket'), 'keyword.operator'), 'o in é operador do JS');
    assert.ok(hasScope(html.scopes(1, 'item.Id'), 'meta.embedded.expression.vue'));
  });

  test('diretiva sem valor também é reconhecida', (t) => {
    const html = inspectTag(t, '<span v-else v-cloak #footer></span>');
    if (!html) {
      return;
    }
    assert.ok(hasScope(html.scopes(1, 'v-else'), 'keyword.control.directive.vue'));
    assert.ok(hasScope(html.scopes(1, 'v-cloak'), 'keyword.control.directive.vue'));
    assert.ok(hasScope(html.scopes(1, '#'), 'keyword.control.directive.vue'));
    assert.ok(hasScope(html.scopes(1, 'footer'), 'entity.other.attribute-name.vue'));
  });

  test('vale fora de {% raw %} e em linha de continuação', (t) => {
    // 18 dos 60 arquivos do corpus que usam diretiva não têm raw nenhum, e o
    // atributo em linha própria é a saída do próprio formatador da extensão.
    const html = inspectTag(t, '<div\n:class="{ aberto: ativo }"\n@click="fechar">');
    if (!html) {
      return;
    }
    assert.ok(!html.lineHas(2, 'meta.embedded.block.raw.linx'), 'pré-condição: fora de raw');
    assert.ok(hasScope(html.scopes(2, ':'), 'keyword.control.directive.vue'), 'na coluna 0');
    assert.ok(hasScope(html.scopes(3, '@'), 'keyword.control.directive.vue'));
  });

  test('atributo comum não vira diretiva', (t) => {
    const html = inspectTag(t, '<div title="use @click= aqui" data-v-if="nao" href="a:b=1"></div>');
    if (!html) {
      return;
    }
    assert.ok(
      !html.lineHas(1, 'meta.directive.vue'),
      'nem o @click dentro do valor, nem data-v-if, nem o a:b=1 do href',
    );
  });

  test('os dois-pontos do {% include ... with context %} continuam Liquid', (t) => {
    const html = inspectTag(t, "{% include /Components/BuyButton/index with context BuyText: 'COMPRE' %}");
    if (!html) {
      return;
    }
    assert.ok(!html.lineHas(1, 'meta.directive.vue'), 'a injeção fica fora de meta.tag.liquid');
    assert.ok(html.lineHas(1, 'keyword.control.liquid'));
  });

  test('o Liquid dentro do valor da diretiva continua sendo Liquid', (t) => {
    // register.template:75 — v-model="AddOrSetCustomer.{{ field.PropertyName }}"
    const html = inspectTag(t, '<input v-model="AddOrSetCustomer.{{ field.PropertyName }}">');
    if (!html) {
      return;
    }
    const field = html.scopes(1, 'field');
    assert.ok(hasScope(field, 'meta.embedded.expression.liquid'), 'a injeção do Liquid tem prioridade');
    assert.ok(!isJavaScript(field), 'não é lido como JavaScript');
  });

  test('valor com aspas simples fecha nas aspas simples', (t) => {
    const html = inspectTag(t, `<span :title='nome' class="depois"></span>`);
    if (!html) {
      return;
    }
    assert.ok(hasScope(html.scopes(1, 'nome'), 'meta.embedded.expression.vue'));
    assert.ok(
      hasScope(html.scopes(1, 'class'), 'entity.other.attribute-name.html'),
      'o atributo seguinte continua sendo atributo HTML comum',
    );
  });
});

corpusDescribe('gramática — alternância raw ↔ Liquid', () => {
  test('dentro de {% raw %} os {{ }} são mustaches do Vue', () => {
    const basket = inspect('Pages/OnePageCheckout/components/basket.template');

    const name = basket.scopes(27, 'item.Name');
    assert.ok(
      hasScope(name, 'meta.embedded.block.raw.linx'),
      'o corpo do componente está na região raw',
    );
    assert.ok(
      hasScope(name, 'meta.embedded.expression.vue'),
      '{{ item.Name }} é interpolação do Vue, não Liquid',
    );
    assert.ok(
      !hasScope(name, 'meta.embedded.expression.liquid'),
      'não pode receber escopo de Liquid',
    );
  });

  test('o filtro do Vue é distinguido do || do JavaScript', () => {
    const basket = inspect('Pages/OnePageCheckout/components/basket.template');
    assert.ok(
      hasScope(basket.scopes(63, 'currency'), 'support.function.filter.vue'),
      '`| currency` é filtro do Vue',
    );

    // order-summary.template:120 usa `||` do JavaScript dentro do mustache.
    const summary = inspect('Pages/OnePageCheckout/components/order-summary.template');
    assert.ok(
      !hasScope(summary.scopes(120, '||'), 'support.function.filter'),
      '`||` não pode ser lido como filtro',
    );
  });

  test('{%raw%} colado (sem espaços) abre a região igual', () => {
    const login = inspect('Pages/OnePageCheckout/components/login.template');
    assert.match(lineAt(login.text, 1), /\{%raw%\}/, 'pré-condição: forma colada');
    assert.ok(
      login.lineHas(20, 'meta.embedded.block.raw.linx'),
      'a forma sem espaços precisa abrir a região raw',
    );
  });

  test('{% endraw %} no meio de um valor de atributo devolve o Liquid', (t) => {
    if (!hasBuiltins) {
      t.skip('sem VS Code instalado, text.html.basic não carrega e o teste não é fiel');
      return;
    }
    const file = inspect('Pages/OnePageCheckout/wd.checkout.onepage.template');
    assert.match(lineAt(file.text, 31), /href="\{% endraw %\}/, 'pré-condição');

    const urls = file.scopes(31, 'Urls.BaseUrl');
    assert.ok(
      hasScope(urls, 'meta.embedded.expression.liquid'),
      '{{ Urls.BaseUrl }} dentro do atributo é Liquid — só a injeção alcança aqui',
    );
    assert.ok(
      !hasScope(urls, 'meta.embedded.expression.vue'),
      'não pode ser tratado como mustache do Vue',
    );
  });

  test('o {% endraw %} que fecha o bloco de verdade não é sequestrado pela injeção', () => {
    const register = inspect('Pages/OnePageCheckout/components/register.template');

    // O endraw da linha 40 não tem {% raw %} na mesma linha: fecha o bloco.
    const assign = register.scopes(49, 'entities');
    assert.ok(
      !hasScope(assign, 'meta.embedded.block.raw.linx'),
      'as linhas 41-107 saíram da região raw',
    );
    assert.ok(register.lineHas(49, 'keyword.control.liquid'), '{% assign %} é tag Liquid ativa');

    assert.ok(
      register.lineHas(113, 'meta.embedded.block.raw.linx'),
      'depois do {% raw %} da linha 108, volta a ser região raw',
    );
  });

  test('{% endraw %} dentro de comentário HTML também devolve o Liquid', (t) => {
    if (!hasBuiltins) {
      t.skip('precisa da gramática HTML real para o comentário virar sub-regra');
      return;
    }
    const addresses = inspect('Pages/OnePageCheckout/components/delivery-addresses.template');
    assert.ok(
      hasScope(addresses.scopes(51, 'sharedthemepath'), 'support.function.filter.liquid'),
      'o filtro dentro do comentário HTML é Liquid ativo — o comentário não protege nada',
    );
  });
});

corpusDescribe('gramática — tags e filtros do dialeto', () => {
  test('as 12 tags proprietárias têm escopo próprio', () => {
    const cases: [string, number, string][] = [
      ['Pages/OnePageCheckout/components/register.template', 56, 'profile_register'],
      ['Pages/OnePageCheckout/includes/PageFooter.template', 33, 'system_recaptcha_v3'],
      ['Pages/OnePageCheckout/includes/PageFooter.template', 36, 'page_assets'],
      ['Pages/OnePageCheckout/includes/PageFooter.template', 52, 'page_speed'],
      ['Pages/OnePageCheckout/includes/PageFooter.template', 44, 'google_tag_manager_newversion'],
      ['Pages/OnePageCheckout/includes/PageHeader.template', 167, 'browsing_context_data'],
      ['Pages/OnePageCheckout/includes/PageHeader.template', 245, 'browsing_context'],
      ['Pages/OnePageCheckout/components/delivery-addresses.template', 154, 'metadata_for'],
    ];

    for (const [file, line, tag] of cases) {
      assert.ok(
        hasScope(inspect(file).scopes(line, tag), 'support.function.linx.liquid'),
        `${tag} (${file}:${line}) deve ter o escopo das tags da Linx`,
      );
    }
  });

  test('argumentos nomeados com : e com = são reconhecidos', () => {
    const footer = inspect('Pages/OnePageCheckout/includes/PageFooter.template');
    assert.ok(
      hasScope(footer.scopes(44, 'ContainerId'), 'variable.parameter.linx.liquid'),
      'ContainerId: usa dois-pontos',
    );

    const header = inspect('Pages/OnePageCheckout/includes/PageHeader.template');
    assert.ok(
      hasScope(header.scopes(167, 'Template'), 'variable.parameter.linx.liquid'),
      'Template= usa igual',
    );
    assert.ok(
      hasScope(header.scopes(245, 'forceScript'), 'variable.parameter.linx.liquid'),
      'forceScript=false usa igual com booleano',
    );
  });

  test('&& do C# é operador e null é constante', () => {
    const header = inspect('Pages/OnePageCheckout/includes/PageHeader.template');
    assert.ok(
      hasScope(header.scopes(5, '&&'), 'keyword.operator'),
      '&& não é Liquid padrão, mas o dialeto aceita',
    );
    assert.ok(
      hasScope(header.scopes(5, 'null'), 'constant.language.liquid'),
      'o dialeto usa null, não nil',
    );
  });

  test('o caminho sem aspas do {% include %} é string', () => {
    const index = inspect('Pages/OnePageCheckout/index.template');
    assert.ok(
      hasScope(
        index.scopes(4, '/Pages/OnePageCheckout/includes/PageHeader'),
        'string.unquoted.path.liquid',
      ),
    );
  });

  test('{% comment %} é opaco: o capture aninhado não vira tag', () => {
    const register = inspect('Pages/OnePageCheckout/components/register.template');
    assert.ok(
      hasScope(register.scopes(43, 'capture'), 'comment.block.liquid'),
      'tudo entre {% comment %} e {% endcomment %} é comentário',
    );
    assert.ok(
      !register.lineHas(43, 'keyword.control.liquid'),
      'o {% capture %} comentado não pode ser destacado como tag ativa',
    );
  });

  test('filtros encadeados com escape são reconhecidos', () => {
    const input = inspect('Pages/OnePageCheckout/helpers/input.template');
    const replaces = input.tokens.filter(
      (t) =>
        t.line === 17 &&
        t.text.includes('replace') &&
        hasScope(t.scopes, 'support.function.filter.liquid'),
    );
    assert.equal(replaces.length, 2, 'os dois `| replace` encadeados da linha 17');
  });

  test('Liquid dentro de <script> e dentro de string JS é reconhecido', (t) => {
    if (!hasBuiltins) {
      t.skip('precisa da gramática JavaScript real');
      return;
    }
    const header = inspect('Pages/OnePageCheckout/includes/PageHeader.template');

    assert.ok(
      header.lineHas(55, 'meta.embedded.expression.liquid'),
      'const configs = {{ Config | json }} dentro do <script>',
    );
    assert.ok(
      hasScope(header.scopes(72, 'contentpath'), 'support.function.filter.liquid'),
      'Liquid dentro de string JS de aspas duplas (linha 72)',
    );
    assert.ok(
      header.lineHas(121, 'keyword.control.liquid'),
      '{% for %} gerando array JSON dentro do <script> (linha 121)',
    );
    assert.ok(
      hasScope(header.scopes(123, 'formatdecimal'), 'support.function.filter.liquid'),
      'filtro Liquid dentro de um valor de objeto JS (linha 123)',
    );
    assert.ok(
      header.lineHas(113, 'keyword.control.liquid'),
      '{% if %}…{% else %}…{% endif %} inline no meio de um valor JSON (linha 113)',
    );
    assert.ok(
      hasScope(header.scopes(218, 'Widget.PaymentGroupHighlighted'), 'meta.embedded.expression.liquid'),
      'Liquid dentro de string JS de aspas simples (linha 218)',
    );
  });
});

corpusDescribe('gramática — invariantes sobre o corpus', () => {
  test('nenhum arquivo termina com região raw pendente', () => {
    const pending: string[] = [];
    for (const file of [
      'Pages/OnePageCheckout/components/basket.template',
      'Pages/OnePageCheckout/components/register.template',
      'Pages/OnePageCheckout/components/delivery-addresses.template',
      'Pages/OnePageCheckout/wd.checkout.onepage.template',
      'Pages/OnePageCheckout/components/login.template',
      'Pages/OnePageCheckout/components/payments.template',
    ]) {
      const { tokens } = inspect(file);
      const last = tokens[tokens.length - 1];
      if (last && hasScope(last.scopes, 'meta.embedded.block.raw.linx')) {
        pending.push(file);
      }
    }
    assert.deepEqual(pending, [], 'o {% endraw %} final tem que fechar a região');
  });

  test('arquivos sem raw nunca entram em região raw', () => {
    for (const file of [
      'Pages/OnePageCheckout/index.template',
      'Pages/OnePageCheckout/helpers/data.template',
      'Pages/OnePageCheckout/components/social.template',
    ]) {
      const { tokens } = inspect(file);
      assert.ok(
        !tokens.some((t) => hasScope(t.scopes, 'meta.embedded.block.raw.linx')),
        `${file} não usa {% raw %}`,
      );
    }
  });
});
