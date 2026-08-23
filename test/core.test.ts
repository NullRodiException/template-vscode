import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { toggleBlockComment, type TextEditOp } from '../src/core/comment.ts';
import { findPathReferences } from '../src/core/references.ts';
import { analyze } from '../src/core/diagnostics.ts';
import {
  BLOCK_TAGS,
  VUE_DIRECTIVES,
  VUE_BOUND_ATTRIBUTES,
  VUE_EVENTS,
  DIRECTIVE_SNIPPETS,
  directiveName,
  attributeSlotAt,
  VOID_ELEMENTS,
} from '../src/core/liquidTags.ts';
import {
  HTML_ELEMENTS,
  attributesFor,
  valuesFor,
  tagNameSlotAt,
  attributeValueSlotAt,
  enclosingElement,
  closingTagFor,
} from '../src/core/htmlData.ts';
import {
  resolveIncludePath,
  resolveDeployPath,
  resolveThemePath,
  findCounterpart,
  findThemeRoot,
  getThemeInfo,
  toIncludePath,
} from '../src/core/theme.ts';
import {
  read,
  corpus,
  fixture,
  allTemplates,
  offsetOfLine,
  CORPUS_ROOT,
  REPO_ROOT,
  corpusTest,
  corpusDescribe,
} from './helpers.ts';

/** Aplica os edits (que já vêm do fim para o início) sobre o texto. */
function apply(text: string, edits: TextEditOp[]): string {
  let out = text;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.newText + out.slice(edit.end);
  }
  return out;
}

describe('comentar bloco', () => {
  test('envolve as linhas selecionadas em {% comment %}', () => {
    const text = ['<div>', '\t<p>oi</p>', '</div>'].join('\n');
    const start = text.indexOf('\t<p>');
    const result = toggleBlockComment(text, start, start + 10);

    assert.equal(result.action, 'comment');
    assert.equal(
      apply(text, result.edits),
      ['<div>', '\t{% comment %}', '\t<p>oi</p>', '\t{% endcomment %}', '</div>'].join('\n'),
      'as tags herdam a indentação da primeira linha selecionada',
    );
  });

  test('com seleção vazia, comenta a linha do cursor', () => {
    const text = ['a', 'b', 'c'].join('\n');
    const cursor = text.indexOf('b');
    const result = toggleBlockComment(text, cursor, cursor);

    assert.equal(apply(text, result.edits), ['a', '{% comment %}', 'b', '{% endcomment %}', 'c'].join('\n'));
  });

  test('é reversível: comentar e descomentar volta ao original', () => {
    const text = ['<div>', '\t<p>oi</p>', '</div>'].join('\n');
    const start = text.indexOf('\t<p>');

    const commented = apply(text, toggleBlockComment(text, start, start + 10).edits);
    const inside = commented.indexOf('<p>');
    const back = toggleBlockComment(commented, inside, inside);

    assert.equal(back.action, 'uncomment');
    assert.equal(apply(commented, back.edits), text);
  });

  corpusTest('descomenta o bloco real do register.template sem tocar o capture aninhado', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');
    // O bloco das linhas 42-47 contém um par {% capture %}/{% endcapture %} inteiro.
    const cursor = offsetOfLine(text, 44, 5);

    const result = toggleBlockComment(text, cursor, cursor);
    assert.equal(result.action, 'uncomment');

    const out = apply(text, result.edits);
    assert.ok(out.includes('{% capture moreFields %}'), 'o capture interno continua lá');
    assert.equal(
      (text.match(/\{% endcomment %\}/g) ?? []).length - 1,
      (out.match(/\{% endcomment %\}/g) ?? []).length,
      'exatamente um par de tags de comentário foi removido',
    );
  });

  corpusTest('sinaliza quando o comentário cai dentro de {% raw %}', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    const inRaw = offsetOfLine(text, 27);
    assert.equal(toggleBlockComment(text, inRaw, inRaw).insideRaw, true, 'linha 27 está em raw');

    const outside = read('Pages/OnePageCheckout/index.template');
    const off = offsetOfLine(outside, 4);
    assert.equal(toggleBlockComment(outside, off, off).insideRaw, false, 'index.template não usa raw');
  });
});

describe('referências a arquivos', () => {
  corpusTest('encontra os 20 includes de wd.checkout.onepage.template', () => {
    const text = read('Pages/OnePageCheckout/wd.checkout.onepage.template');
    const includes = findPathReferences(text).filter((r) => r.kind === 'include');

    assert.equal(includes.length, 20);
    assert.ok(
      includes.some((r) => r.path === '/Pages/OnePageCheckout/components/basket'),
      'o include do basket deve estar entre eles',
    );
    assert.ok(
      includes.every((r) => !r.path.endsWith('.template')),
      'o include omite a extensão',
    );
  });

  corpusTest('classifica deploy, theme e shared corretamente', () => {
    const header = findPathReferences(read('Pages/OnePageCheckout/includes/PageHeader.template'));
    assert.ok(
      header.some((r) => r.kind === 'deploy' && r.path.includes('Widgets/checkout.onepage/Styles')),
      'contentpath é caminho de deploy',
    );

    const footer = findPathReferences(read('Pages/OnePageCheckout/includes/PageFooter.template'));
    assert.ok(
      footer.some((r) => r.kind === 'theme' && r.path.includes('/Pages/OnePageCheckout/Scripts/')),
      'themepath é caminho de fonte',
    );

    const addresses = findPathReferences(
      read('Pages/OnePageCheckout/components/delivery-addresses.template'),
    );
    assert.ok(
      addresses.some((r) => r.kind === 'shared'),
      'sharedthemepath tem classificação própria',
    );
  });

  corpusTest('ignora o que está dentro de {% raw %}', () => {
    const text = read('Pages/OnePageCheckout/components/basket.template');
    assert.deepEqual(
      findPathReferences(text),
      [],
      'basket.template é todo raw: nada ali é resolvido pelo servidor',
    );
  });

  corpusTest('acha o template= das tags da Linx', () => {
    const text = read('Pages/OnePageCheckout/components/register.template');
    const deploy = findPathReferences(text).filter((r) => r.kind === 'deploy');
    assert.ok(
      deploy.some((r) => r.path.endsWith('helpers/register.template')),
      'o template= do profile_register da linha 56',
    );
  });

  test('o include aceita aspas, e o range cobre só o caminho', () => {
    const text = '{% include "/ex/index.template" %}';
    const [reference] = findPathReferences(text);

    assert.equal(reference.kind, 'include');
    assert.equal(reference.path, '/ex/index.template');
    assert.equal(
      text.slice(reference.start, reference.end),
      '/ex/index.template',
      'as aspas ficam de fora do link',
    );
  });

  test('o include sem aspas continua sendo reconhecido', () => {
    const [reference] = findPathReferences('{%- include /Pages/OnePageCheckout/components/basket -%}');
    assert.equal(reference?.path, '/Pages/OnePageCheckout/components/basket');
  });

  test('aspas simples também valem', () => {
    const [reference] = findPathReferences("{% include '/ex/index.template' %}");
    assert.equal(reference?.path, '/ex/index.template');
  });

  test('include com aspa não fechada não vira referência', () => {
    assert.deepEqual(findPathReferences('{% include "/ex/index.template %}'), []);
  });
});

describe('include fora de um tema Linx', () => {
  // test/fixtures/plain-project/ é um projeto comum: sem Pages/, e portanto sem
  // raiz de tema. Fica versionado junto com o código, ao contrário de ex/, para
  // que este caso continue coberto num clone sem o corpus.
  const BASE = '/test/fixtures/plain-project';
  const from = fixture('plain-project/teste.template');
  const target = fixture('plain-project/index.template');

  test('resolve a partir da pasta do workspace', () => {
    assert.equal(resolveIncludePath(`${BASE}/index.template`, from, undefined, [REPO_ROOT]), target);
  });

  test('a extensão continua opcional nesse fallback', () => {
    assert.equal(resolveIncludePath(`${BASE}/index`, from, undefined, [REPO_ROOT]), target);
  });

  test('./x resolve contra a pasta do próprio arquivo', () => {
    assert.equal(resolveIncludePath('./index', from), target);
    assert.equal(resolveIncludePath('./index.template', from), target);
  });

  test('sem raiz de tema nem pasta de workspace, não resolve', () => {
    assert.equal(resolveIncludePath(`${BASE}/index.template`, from), undefined);
  });

  test('arquivo inexistente continua sem resolver', () => {
    assert.equal(resolveIncludePath(`${BASE}/nao-existe`, from, undefined, [REPO_ROOT]), undefined);
    assert.equal(resolveIncludePath('./nao-existe', from), undefined);
  });
});

describe('repositório de sites: a raiz do tema é a pasta html/', () => {
  // test/fixtures/site-project/ imita um site do repositório de projetos:
  // `<site>/html/` com Components/ e sem Pages/, mais um `src/scss/` irmão.
  const root = fixture('site-project/html');
  const nested = fixture('site-project/html/Components/ProductMedias/index.template');

  test('sem Pages/, o nome da pasta identifica a raiz', () => {
    assert.equal(findThemeRoot(nested), root);
    assert.equal(findThemeRoot(fixture('site-project/html/product.line.template')), root);
  });

  test('a partir de um arquivo fora de html/, a raiz é a html/ irmã', () => {
    assert.equal(findThemeRoot(fixture('site-project/src/scss/produto/_medias.scss')), root);
  });

  test('include conta da raiz, não da pasta do arquivo', () => {
    assert.equal(
      resolveIncludePath('/Components/Arrows/index', nested),
      fixture('site-project/html/Components/Arrows/index.template'),
    );
    assert.equal(
      resolveIncludePath('/Components/ProductMedias/index', fixture('site-project/html/product.line.template')),
      nested,
    );
    assert.equal(resolveIncludePath('/Components/NaoExiste/index', nested), undefined);
  });

  test('| themepath resolve contra a mesma raiz', () => {
    assert.equal(
      resolveThemePath('/Components/Arrows/index.template?v=2', nested),
      fixture('site-project/html/Components/Arrows/index.template'),
    );
  });

  test('a configuração themeRoot continua tendo a última palavra', () => {
    assert.equal(findThemeRoot(nested, fixture('site-project')), fixture('site-project'));
  });
});

describe('repositório de temas: raiz sem Pages/ e sem html/', () => {
  // test/fixtures/theme-repo/ imita um clone de tema da Linx com vários temas
  // irmãos na raiz — `Base/`, `Shared/` — e nenhum deles com `Pages/` ou
  // `html/`. Nesse formato o sinal de raiz é `Templates/`/`Components/`/
  // `Configs/`, e não há `manifest.xml` em lugar nenhum do clone.
  const workspace = fixture('theme-repo');
  const base = fixture('theme-repo/Base');
  const master = fixture('theme-repo/Base/Templates/masters/1Column.template');
  const dentroDeWidget = fixture(
    'theme-repo/Base/widgets/easy.checkout/Templates/pagamento.template',
  );

  test('Templates/ identifica a raiz quando não há sinal forte', () => {
    assert.equal(findThemeRoot(master, undefined, [workspace]), base);
  });

  test('vence o marcador mais externo, não o mais próximo do arquivo', () => {
    // `Base/widgets/easy.checkout/` também tem `Templates/`. Parar nele faria
    // `{% include /Templates/… %}` contar da pasta do widget.
    assert.equal(findThemeRoot(dentroDeWidget, undefined, [workspace]), base);
    assert.equal(
      resolveIncludePath('/Templates/Painel/painel-menu.template', dentroDeWidget, undefined, [
        workspace,
      ]),
      fixture('theme-repo/Base/Templates/Painel/painel-menu.template'),
    );
  });

  test('sem pasta de workspace o sinal fraco não vale', () => {
    // Fora de um workspace não há fronteira para a subida, e qualquer
    // `Templates/` acima do arquivo seria coincidência do disco de quem edita.
    assert.equal(findThemeRoot(master), undefined);
  });

  test('a configuração themeRoot continua tendo a última palavra', () => {
    assert.equal(findThemeRoot(master, workspace, [workspace]), workspace);
  });

  test('o include com barra inicial conta da raiz detectada', () => {
    assert.equal(
      resolveIncludePath('/Templates/Painel/painel-menu.template', master, undefined, [workspace]),
      fixture('theme-repo/Base/Templates/Painel/painel-menu.template'),
    );
    assert.equal(
      resolveIncludePath('/Configs/vs', master, undefined, [workspace]),
      fixture('theme-repo/Base/Configs/vs.template'),
    );
  });

  test('o include sem barra continua resolvendo pela pasta do arquivo', () => {
    assert.equal(
      resolveIncludePath('includes/PageHeader.template', master, undefined, [workspace]),
      fixture('theme-repo/Base/Templates/masters/includes/PageHeader.template'),
    );
  });
});

describe('esquema de deploy por tema: ~/Custom/Content/Themes/<tema>/…', () => {
  const workspace = fixture('theme-repo');
  const master = fixture('theme-repo/Base/Templates/masters/1Column.template');
  const svg = fixture('theme-repo/Shared/Imagens/loading.svg');

  test('<tema> é a pasta do tema irmão, sem manifesto nenhum', () => {
    assert.equal(
      resolveDeployPath('~/Custom/Content/Themes/Shared/Imagens/loading.svg', master, undefined, [
        workspace,
      ]),
      svg,
    );
    assert.equal(
      resolveDeployPath('/Themes/Shared/Imagens/loading.svg', master, undefined, [workspace]),
      svg,
    );
  });

  test('a caixa das letras não conta', () => {
    // O mesmo arquivo aparece como `/Themes/Shared/…` e `/themes/shared/…` no
    // mesmo repositório: o servidor não distingue, o Linux da CI distingue.
    assert.equal(
      resolveDeployPath('~/custom/content/themes/shared/imagens/LOADING.svg', master, undefined, [
        workspace,
      ]),
      svg,
    );
  });

  test('a querystring de cache-busting sai antes', () => {
    assert.equal(
      resolveDeployPath('/Themes/Shared/Imagens/loading.svg?v=2', master, undefined, [workspace]),
      svg,
    );
  });

  test('o include também aceita esse esquema, com a extensão implícita', () => {
    const script = fixture('theme-repo/Shared/Crediario/script.template');
    assert.equal(
      resolveIncludePath('~/Custom/Content/Themes/Shared/Crediario/script', master, undefined, [
        workspace,
      ]),
      script,
    );
    assert.equal(
      resolveIncludePath(
        '~/custom/content/themes/shared/crediario/script.template',
        master,
        undefined,
        [workspace],
      ),
      script,
    );
  });

  test('tema ou arquivo inexistente não vira link', () => {
    assert.equal(
      resolveDeployPath('/Themes/NaoExiste/Imagens/loading.svg', master, undefined, [workspace]),
      undefined,
    );
    assert.equal(
      resolveDeployPath('/Themes/Shared/Imagens/nao-existe.svg', master, undefined, [workspace]),
      undefined,
    );
    // Uma pasta não é destino de link: `contentpath` numa pasta é concatenação.
    assert.equal(
      resolveDeployPath('/Themes/Shared/Imagens/', master, undefined, [workspace]),
      undefined,
    );
  });
});

describe('caminho de include a partir do arquivo', () => {
  const root = fixture('site-project/html');

  test('conta da raiz do tema, com barra inicial e sem extensão', () => {
    assert.equal(
      toIncludePath(fixture('site-project/html/Components/ProductMedias/index.template'), root),
      '/Components/ProductMedias/index',
    );
  });

  test('arquivo na própria raiz', () => {
    assert.equal(toIncludePath(fixture('site-project/html/product.line.template'), root), '/product.line');
  });

  test('só o .template do fim sai; o resto do nome fica', () => {
    assert.equal(toIncludePath(path.join(root, 'a.template.template'), root), '/a.template');
  });

  test('o caminho copiado é o que o resolvedor abre de volta', () => {
    const file = fixture('site-project/html/Components/Arrows/index.template');
    const includePath = toIncludePath(file, root)!;
    assert.equal(resolveIncludePath(includePath, fixture('site-project/html/product.line.template')), file);
  });

  test('fora da raiz não tem include', () => {
    assert.equal(toIncludePath(fixture('site-project/src/scss/produto/_medias.scss'), root), undefined);
    assert.equal(toIncludePath(fixture('plain-project/index.template'), root), undefined);
  });

  test('quem não é .template não tem include', () => {
    assert.equal(toIncludePath(path.join(root, 'Scripts', 'main.js'), root), undefined);
  });
});

corpusDescribe('resolução de caminhos do tema', () => {
  const anyFile = corpus('Pages/OnePageCheckout/wd.checkout.onepage.template');

  test('a raiz do tema é a pasta que contém Pages/', () => {
    assert.equal(findThemeRoot(anyFile), CORPUS_ROOT);
  });

  test('o manifest.xml é indexado pelo atributo folder', () => {
    const theme = getThemeInfo(anyFile);
    const widget = theme?.widgets.get('checkout.onepage');
    assert.ok(widget, 'o widget checkout.onepage deve ser encontrado');
    assert.equal(widget.dir, corpus('Pages/OnePageCheckout'));
    assert.ok(
      widget.properties.some((p) => p.name === 'CrediarioApiUrl'),
      'as <property> do manifesto são lidas',
    );
  });

  test('{% include %} resolve acrescentando .template', () => {
    assert.equal(
      resolveIncludePath('/Pages/OnePageCheckout/components/basket', anyFile),
      corpus('Pages/OnePageCheckout/components/basket.template'),
    );
    assert.equal(
      resolveIncludePath('/Pages/OnePageCheckout/includes/PageHeader', anyFile),
      corpus('Pages/OnePageCheckout/includes/PageHeader.template'),
    );
    assert.equal(resolveIncludePath('/Pages/NaoExiste/foo', anyFile), undefined);
  });

  test('caminho de deploy traduz via folder do manifesto', () => {
    assert.equal(
      resolveDeployPath('~/Custom/Content/Widgets/checkout.onepage/helpers/register.template', anyFile),
      corpus('Pages/OnePageCheckout/helpers/register.template'),
      'ex/Pages/OnePageCheckout ⇒ Widgets/checkout.onepage',
    );
    assert.equal(
      resolveDeployPath('Widgets/checkout.onepage/Styles/tailwind.css?v=17', anyFile),
      corpus('Pages/OnePageCheckout/Styles/tailwind.css'),
      'a querystring de cache-busting é descartada',
    );
  });

  test('| themepath resolve como caminho de fonte', () => {
    assert.equal(
      resolveThemePath('/Pages/OnePageCheckout/Scripts/main.js?v=2', anyFile),
      corpus('Pages/OnePageCheckout/Scripts/main.js'),
    );
  });

  test('os 19 pares template ↔ js são encontrados nos dois sentidos', () => {
    const pairs = [
      'basket', 'coupons', 'customer', 'delivery', 'delivery-addresses', 'delivery-options',
      'delivery-pickup-modal', 'errors', 'finish', 'login', 'loyalty-card', 'modal',
      'notification', 'order', 'order-summary', 'payments', 'register',
      'sales-representative', 'social',
    ];

    for (const name of pairs) {
      const template = corpus(`Pages/OnePageCheckout/components/${name}.template`);
      const script = corpus(`Pages/OnePageCheckout/Scripts/components/${name}.js`);
      assert.equal(findCounterpart(template), script, `${name}: template → js`);
      assert.equal(findCounterpart(script), template, `${name}: js → template`);
    }
  });

  test('crediario.template pareia com o script na raiz de Scripts/', () => {
    assert.equal(
      findCounterpart(corpus('Pages/OnePageCheckout/components/crediario.template')),
      corpus('Pages/OnePageCheckout/Scripts/crediario.js'),
      'a exceção da convenção precisa do fallback',
    );
  });

  test('componente órfão não inventa contraparte', () => {
    assert.equal(
      findCounterpart(corpus('Pages/OnePageCheckout/Scripts/components/summary.js')),
      undefined,
      'summary.js aponta para um #tpl-summary que não existe',
    );
  });
});

describe('diagnósticos', () => {
  corpusTest('os 27 arquivos do corpus não têm erro de balanceamento', () => {
    const errors: string[] = [];
    for (const file of allTemplates()) {
      for (const problem of analyze(read(file))) {
        if (problem.severity === 'error') {
          errors.push(`${file}: ${problem.message}`);
        }
      }
    }
    assert.deepEqual(errors, []);
  });

  test('{% raw %} sem fechamento é erro', () => {
    const problems = analyze('{% raw %}\n<p>oi</p>\n');
    assert.equal(problems.length, 1);
    assert.equal(problems[0].code, 'unbalanced-raw');
    assert.equal(problems[0].severity, 'error');
  });

  test('{% endraw %} sem abertura é erro', () => {
    const problems = analyze('<p>oi</p>\n{% endraw %}\n');
    assert.equal(problems[0].code, 'unbalanced-raw');
    assert.match(problems[0].message, /sem o \{% raw %\}/);
  });

  test('{% comment %} dentro de raw é avisado', () => {
    const problems = analyze('{% raw %}\n{% comment %}\nx\n{% endcomment %}\n{% endraw %}');
    const warning = problems.find((p) => p.code === 'comment-in-raw');
    assert.ok(warning, 'deve avisar que o comentário não é processado ali');
    assert.equal(warning.severity, 'warning');
    assert.match(warning.message, /<!-- -->/);
  });

  corpusTest('Liquid ativo dentro de comentário HTML é sinalizado', () => {
    const text = read('Pages/OnePageCheckout/components/delivery-addresses.template');
    const problem = analyze(text).find((p) => p.code === 'liquid-in-html-comment');

    assert.ok(problem, 'o {% endraw %} comentado da linha 51 deve ser detectado');
    assert.equal(problem.severity, 'info');
    assert.ok(
      problem.start >= offsetOfLine(text, 49) && problem.start <= offsetOfLine(text, 64),
      'a marcação cai dentro do comentário HTML das linhas 49-63',
    );
  });

  test('{{ }} dentro de comentário HTML não gera ruído', () => {
    // Um output é inofensivo; só tags podem ter efeito colateral.
    const problems = analyze('<!-- <p>{{ Config.General.Store.Name }}</p> -->');
    assert.deepEqual(problems, []);
  });
});

describe('diagnósticos — blocos desbalanceados', () => {
  /** Só os problemas de bloco, na ordem em que aparecem no texto. */
  function blocks(text: string) {
    return analyze(text).filter((p) => p.code === 'unbalanced-block');
  }

  test('{% if %} sem {% endif %} é erro apontado na abertura', () => {
    const text = '{% if x %}\n<p>oi</p>\n';
    const [problem] = blocks(text);

    assert.ok(problem, 'a abertura órfã deve ser reportada');
    assert.equal(problem.severity, 'error');
    assert.equal(text.slice(problem.start, problem.end), '{% if x %}', 'o range cobre a tag inteira');
    assert.match(problem.message, /\{% endif %\}/, 'a mensagem diz qual tag está faltando');
  });

  test('{% endfor %} sem abertura é erro', () => {
    const [problem] = blocks('<p>oi</p>\n{% endfor %}');
    assert.equal(problem?.severity, 'error');
    assert.match(problem.message, /sem o \{% for %\} correspondente/);
  });

  test('blocos aninhados corretos não geram nada', () => {
    assert.deepEqual(
      blocks('{% for i in x %}{% if i %}{% case i %}{% when 1 %}a{% endcase %}{% endif %}{% endfor %}'),
      [],
      '{% when %} é tag do meio: não abre bloco',
    );
  });

  test('todos os pares de BLOCK_TAGS/END_TAGS se reconhecem', () => {
    for (const tag of BLOCK_TAGS) {
      assert.deepEqual(blocks(`{% ${tag} x %}conteúdo{% end${tag} %}`), [], `${tag} deve balancear`);
      assert.equal(blocks(`{% ${tag} x %}conteúdo`).length, 1, `${tag} sozinho deve ser reportado`);
    }
  });

  test('fechar o bloco de fora denuncia o de dentro', () => {
    // {% if %} abre, {% for %} abre, e só o endif aparece.
    const problems = blocks('{% if a %}\n{% for i in b %}\n<p>x</p>\n{% endif %}');

    assert.equal(problems.length, 1, 'só o for ficou aberto — o if fechou');
    assert.match(problems[0].message, /\{% for %\} nunca é fechado/);
    assert.match(problems[0].message, /\{% endif %\}/, 'a mensagem explica quem fechou por fora');
  });

  test('o que está dentro de {% raw %} e de {% comment %} não conta', () => {
    assert.deepEqual(
      blocks('{% raw %}{% if x %}{% endraw %}'),
      [],
      'dentro de raw, {% if %} é texto literal',
    );
    assert.deepEqual(
      blocks('{% comment %}{% if x %}{% endcomment %}'),
      [],
      'dentro de comment nada é processado',
    );
  });

  test('o que está dentro de comentário HTML conta', () => {
    // O comentário HTML não protege nada: o Liquid roda antes do HTML.
    assert.equal(
      blocks('<!-- {% if x %} -->\n<p>oi</p>').length,
      1,
      'o {% if %} comentado executa no servidor e continua aberto',
    );
  });

  test('{% raw %} desbalanceado suprime a checagem de blocos', () => {
    // Sem o {% endraw %}, o resto do arquivo muda de região; reportar blocos aí
    // seria uma cascata de erros derivados escondendo a causa única.
    const problems = analyze('{% raw %}\n{% if x %}\n<p>oi</p>\n');

    assert.equal(problems.length, 1);
    assert.equal(problems[0].code, 'unbalanced-raw');
  });

  test('include não abre bloco', () => {
    assert.deepEqual(
      blocks('{% include /Pages/OnePageCheckout/components/basket %}'),
      [],
      'as tags neutras e as 12 da Linx nunca desbalanceiam',
    );
  });
});

describe('diagnósticos — filtro na região errada', () => {
  function filters(text: string) {
    return analyze(text).filter((p) => p.code === 'filter-wrong-region');
  }

  test('filtro do Vue fora de raw é avisado', () => {
    const text = '<p>{{ item.RetailPrice | currency }}</p>';
    const [problem] = filters(text);

    assert.ok(problem, '| currency é do Vue e não existe no servidor');
    assert.equal(problem.severity, 'warning');
    assert.equal(text.slice(problem.start, problem.end), 'currency', 'o range cobre só o nome');
  });

  test('filtro do Liquid dentro de raw é avisado', () => {
    const [problem] = filters('{% raw %}{{ Config | json }}{% endraw %}');
    assert.ok(problem, '| json não roda dentro de raw');
    assert.match(problem.message, /não roda/);
  });

  test('cada filtro no seu lugar não gera nada', () => {
    assert.deepEqual(filters('{{ Config | json }}'), []);
    assert.deepEqual(filters('{% raw %}{{ item.Price | currency }}{% endraw %}'), []);
  });

  test('o || do JavaScript não é lido como filtro', () => {
    assert.deepEqual(
      filters('{% raw %}{{ a || currency }}{% endraw %}'),
      [],
      'o `||` já foi confundido com filtro antes; a gramática e o diagnóstico têm que concordar',
    );
  });

  test('o | fora de uma interpolação é ignorado', () => {
    assert.deepEqual(
      filters('<script>const mask = a | currency;</script>'),
      [],
      'bitwise-or de JavaScript não é pipe de filtro',
    );
  });

  test('filtro desconhecido das duas tabelas não vira ruído', () => {
    assert.deepEqual(
      filters('{{ x | filtroCustomizadoDoProjeto }}'),
      [],
      'só o que é exclusivo de uma das tabelas é reportado',
    );
  });

  test('dentro de {% comment %} nada é reportado', () => {
    assert.deepEqual(filters('{% comment %}{{ x | currency }}{% endcomment %}'), []);
  });
});

describe('diretivas do Vue', () => {
  test('o atalho resolve para a diretiva que abrevia', () => {
    assert.equal(directiveName(':class'), 'v-bind');
    assert.equal(directiveName(':[chave]'), 'v-bind');
    assert.equal(directiveName('@click'), 'v-on');
    assert.equal(directiveName('#footer'), 'v-slot');
  });

  test('argumento e modificadores não mudam o nome', () => {
    assert.equal(directiveName('v-on:change.stop.prevent'), 'v-on');
    assert.equal(directiveName('v-bind:src'), 'v-bind');
    assert.equal(directiveName('@keyup.enter'), 'v-on');
    assert.equal(directiveName('v-else-if'), 'v-else-if', 'o hífen do nome não é separador');
  });

  test('o que não é diretiva não vira uma', () => {
    // O sinal sozinho aparece em `{% include … BuyText: 'x' %}` e em `a:b` de href.
    assert.equal(directiveName(':'), undefined);
    assert.equal(directiveName('class'), undefined);
    assert.equal(directiveName('data-v-if'), undefined);
    assert.equal(directiveName('v-naoexiste'), undefined, 'diretiva de terceiro sem entrada na tabela');
  });

  test('toda entrada da tabela está completa', () => {
    for (const [name, entry] of Object.entries(VUE_DIRECTIVES)) {
      assert.ok(entry.signature.includes(name), `${name}: a assinatura cita a diretiva`);
      assert.ok(entry.doc.length > 20, `${name}: sem documentação`);
      assert.ok(entry.example.includes('<'), `${name}: o exemplo é um trecho de HTML`);
    }
  });
});

/** O `|` marca o cursor e sai do texto antes da chamada. */
function slotAt(marked: string): string | undefined {
  const offset = marked.indexOf('|');
  assert.notEqual(offset, -1, 'o caso precisa marcar o cursor com `|`');
  return attributeSlotAt(marked.replace('|', ''), offset)?.word;
}

describe('posição de atributo para o completion de diretiva', () => {
  test('o sinal entra no trecho que a sugestão substitui', () => {
    // O caso do relato: com o range começando no `:`, aceitar a sugestão
    // escreve `:class`; sem ele o `wordPattern` deixaria o sinal para trás e
    // sobraria `::class`.
    const slot = attributeSlotAt('<h1 :c></h1>', 6);
    assert.deepEqual(slot, { word: ':c', start: 4 });
  });

  test('o atalho e a forma longa contam como uma palavra só', () => {
    assert.equal(slotAt('<h1 :c|></h1>'), ':c');
    assert.equal(slotAt('<button @cli|></button>'), '@cli');
    assert.equal(slotAt('<div v-i|>'), 'v-i');
    assert.equal(slotAt('<a @click.prev|></a>'), '@click.prev', 'com modificador');
  });

  test('atributo ainda vazio é posição válida', () => {
    // É o Ctrl+Space logo depois do espaço, que deve abrir o menu inteiro.
    assert.equal(slotAt('<div |></div>'), '');
    assert.equal(slotAt('<input class="x" |>'), '');
  });

  test('a tag continua aberta depois de um `>` dentro de aspas', () => {
    // `v-if="qtd > 0"` é comum, e ali o `>` é operador, não fim da tag.
    assert.equal(slotAt('<div v-if="qtd > 0" :c|>'), ':c');
  });

  test('a tag pode estar quebrada em várias linhas', () => {
    assert.equal(slotAt('<input\n\ttype="text"\n\tv-mo|>'), 'v-mo');
  });

  test('fora de uma posição de atributo não há sugestão', () => {
    assert.equal(slotAt('<di|v>'), undefined, 'ainda é o nome da tag');
    assert.equal(slotAt('<div class="a|">'), undefined, 'dentro do valor quem completa é o JS');
    assert.equal(slotAt('<div :class="\'|\'">'), undefined, 'dentro do valor, com aspas simples');
    assert.equal(slotAt('<div class=|>'), undefined, 'depois do `=` vem valor, não nome');
    assert.equal(slotAt('<div> |</div>'), undefined, 'a tag já fechou');
    assert.equal(slotAt('texto solto |'), undefined, 'não há tag nenhuma');
    assert.equal(slotAt('</div |>'), undefined, 'tag de fechamento não leva atributo');
  });

  test('dentro do Liquid no meio da tag nada é diretiva', () => {
    // Os dois-pontos de `where:'x'` são argumento do include, não v-bind.
    assert.equal(slotAt("<div {% include /x where:'a'| %}>"), undefined);
    assert.equal(slotAt('<div {% if x |%}>'), undefined);
    assert.equal(
      slotAt('<div {% if x %} :c|>'),
      ':c',
      'depois do {% %} fechado a tag volta a aceitar atributo',
    );
  });
});

describe('tabelas do completion de diretiva', () => {
  test('todo snippet começa pela diretiva que ele escreve', () => {
    for (const [name, snippet] of Object.entries(DIRECTIVE_SNIPPETS)) {
      assert.ok(name in VUE_DIRECTIVES, `${name}: snippet sem entrada em VUE_DIRECTIVES`);
      assert.ok(snippet.startsWith(name), `${name}: o snippet não começa pelo nome`);
    }
  });

  test('todo atributo e evento tem descrição', () => {
    for (const [name, doc] of Object.entries({ ...VUE_BOUND_ATTRIBUTES, ...VUE_EVENTS })) {
      assert.ok(doc.length > 10, `${name}: sem descrição`);
    }
  });

  test('o atalho de cada tabela resolve para a diretiva certa', () => {
    for (const name of Object.keys(VUE_BOUND_ATTRIBUTES)) {
      assert.equal(directiveName(`:${name}`), 'v-bind', `:${name}`);
    }
    for (const name of Object.keys(VUE_EVENTS)) {
      assert.equal(directiveName(`@${name}`), 'v-on', `@${name}`);
    }
  });
});

/** O `|` marca o cursor, sai do texto e vira o offset passado à função. */
function at<T>(marked: string, fn: (text: string, offset: number) => T): T {
  const offset = marked.indexOf('|');
  assert.notEqual(offset, -1, 'o caso precisa marcar o cursor com `|`');
  return fn(marked.replace('|', ''), offset);
}

describe('posição de nome de tag', () => {
  test('depois do `<`, com ou sem nome começado', () => {
    assert.deepEqual(at('<|', tagNameSlotAt), { word: '', start: 0, closing: false });
    assert.deepEqual(at('<p>oi</p>\n<di|', tagNameSlotAt), { word: 'di', start: 10, closing: false });
    assert.deepEqual(at('<div></di|', tagNameSlotAt), { word: 'di', start: 5, closing: true });
  });

  test('o `<` que não abre tag não conta', () => {
    assert.equal(at('{% if qtd <| 10 %}', tagNameSlotAt), undefined, 'operador do Liquid');
    assert.equal(at('<a href="a<|b">', tagNameSlotAt), undefined, 'dentro do valor do atributo');
    assert.equal(at('<div <|', tagNameSlotAt), undefined, 'a tag de fora ainda não fechou');
    assert.equal(at('<div v-if="a <| b">', tagNameSlotAt), undefined, 'comparação na expressão do Vue');
    assert.deepEqual(
      at('{% if x %}<|', tagNameSlotAt),
      { word: '', start: 10, closing: false },
      'com o {% %} fechado, o `<` volta a abrir tag',
    );
  });

  test('o texto entre tags abre tag', () => {
    assert.deepEqual(at('<div>texto <|', tagNameSlotAt), { word: '', start: 11, closing: false });
  });
});

describe('posição de valor de atributo', () => {
  test('devolve a tag, o atributo e o que já foi digitado', () => {
    assert.deepEqual(at('<input type="te|">', attributeValueSlotAt), {
      tag: 'input',
      attribute: 'type',
      word: 'te',
      start: 13,
    });
    assert.deepEqual(at("<a target='|'>", attributeValueSlotAt), {
      tag: 'a',
      attribute: 'target',
      word: '',
      start: 11,
    });
  });

  test('o que não é valor de atributo simples fica de fora', () => {
    assert.equal(at('<input type=|>', attributeValueSlotAt), undefined, 'ainda não abriu aspas');
    assert.equal(at('<input |>', attributeValueSlotAt), undefined, 'posição de nome de atributo');
    assert.equal(at('<input :type="te|">', attributeValueSlotAt), undefined, 'o valor de :type é JS');
    assert.equal(at('<input v-model="a|">', attributeValueSlotAt), undefined, 'idem na diretiva');
    assert.equal(
      at('<img src="{{ Widget.Ur|" >', attributeValueSlotAt),
      undefined,
      'dentro do {{ }} quem completa é o Liquid',
    );
    assert.equal(at('<input type="text"|>', attributeValueSlotAt), undefined, 'o valor já fechou');
  });
});

describe('elemento aberto no offset', () => {
  const text = '<div class="a">\n\t<ul>\n\t\t<li>x</li>\n\t\t\n\t</ul>\n</div>';

  test('é o mais interno ainda aberto', () => {
    assert.equal(at(text.replace('\t\t\n', '\t\t|\n'), enclosingElement), 'ul');
    assert.equal(at('<div><span>|', enclosingElement), 'span');
    assert.equal(at('<div><span></span>|', enclosingElement), 'div');
  });

  test('void e self-closing não entram na pilha', () => {
    assert.equal(at('<div><br><img src="x">|', enclosingElement), 'div');
    assert.equal(at('<div><input />|', enclosingElement), 'div');
  });

  test('fechamento sem par é descartado em vez de estourar a pilha', () => {
    // No meio da edição o arquivo passa boa parte do tempo desemparelhado.
    assert.equal(at('</section><div>|', enclosingElement), 'div');
    assert.equal(at('<div></span>|', enclosingElement), 'div');
    assert.equal(at('texto|', enclosingElement), undefined);
  });
});

describe('fechamento automático de tag', () => {
  test('fecha o elemento que o `>` acabou de abrir', () => {
    assert.equal(at('<div>|', closingTagFor), '</div>');
    assert.equal(at('<a href="/x" class="b">|', closingTagFor), '</a>');
  });

  test('não fecha o que não pede fechamento', () => {
    assert.equal(at('<br>|', closingTagFor), undefined, 'void');
    assert.equal(at('<input />|', closingTagFor), undefined, 'self-closing');
    assert.equal(at('</div>|', closingTagFor), undefined, 'já é o fechamento');
    assert.equal(at('{% if a > b %}|', closingTagFor), undefined, 'o `>` é operador do Liquid');
    assert.equal(
      at('<div v-if="qtd >| 0"></div>', closingTagFor),
      undefined,
      'o `>` é operador dentro do valor',
    );
    assert.equal(
      at('<div>|</div>', closingTagFor),
      undefined,
      'já existe fechamento logo adiante — reeditar atributos não pode duplicar',
    );
  });
});

describe('tabela do HTML', () => {
  test('todo elemento tem descrição', () => {
    for (const [name, element] of Object.entries(HTML_ELEMENTS)) {
      assert.ok(element.doc.length > 3, `${name}: sem descrição`);
    }
  });

  test('os atributos do elemento vêm antes dos globais, sem repetir', () => {
    const attributes = attributesFor('img');
    assert.equal(attributes[0], 'src');
    assert.ok(attributes.includes('class'), 'os globais entram junto');
    assert.equal(
      new Set(attributes).size,
      attributes.length,
      'nada pode aparecer duas vezes no menu',
    );
    // `title` é global e também está na lista de vários elementos.
    assert.equal(attributesFor('div').filter((name) => name === 'title').length, 1);
  });

  test('o valor depende do elemento, não só do nome do atributo', () => {
    assert.ok(valuesFor('input', 'type').includes('checkbox'));
    assert.deepEqual(valuesFor('button', 'type'), ['submit', 'reset', 'button']);
    assert.ok(valuesFor('script', 'type').includes('text/x-template'));
    assert.deepEqual(valuesFor('div', 'class'), [], 'atributo de valor livre');
  });

  test('todo elemento void da tabela é conhecido pelo indentador', () => {
    // Quem decide se a tag abre nível é VOID_ELEMENTS; o completion e o
    // fechamento automático leem a mesma lista, então divergir aqui daria
    // `<img>` fechado com `</img>` e indentação errada de quebra.
    for (const name of VOID_ELEMENTS) {
      if (name !== '!doctype') {
        assert.ok(name in HTML_ELEMENTS, `${name}: void sem entrada em HTML_ELEMENTS`);
      }
    }
  });
});

corpusDescribe('estrutura do corpus', () => {
  test('todo include do corpus aponta para um arquivo existente', () => {
    const broken: string[] = [];
    for (const file of allTemplates()) {
      const from = path.join(CORPUS_ROOT, file);
      for (const reference of findPathReferences(read(file))) {
        // `[REPO_ROOT]` reproduz o que a extensão passa como pasta do workspace.
        if (reference.kind === 'include' && !resolveIncludePath(reference.path, from, undefined, [REPO_ROOT])) {
          broken.push(`${file} → ${reference.path}`);
        }
      }
    }
    assert.deepEqual(broken, []);
  });
});
