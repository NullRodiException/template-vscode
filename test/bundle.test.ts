/**
 * Smoke test do bundle publicado.
 *
 * Carrega `dist/extension.cjs` com um stub do módulo `vscode` e roda o
 * `activate`. Pega o que os testes de unidade não pegam: erro de sintaxe no
 * bundle, dependência circular, `main` apontando para o lugar errado, e
 * registro de comando declarado no manifesto mas nunca implementado.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Module from 'node:module';
import { createRequire } from 'node:module';

import { REPO_ROOT } from './helpers.ts';

const require = createRequire(import.meta.url);

interface Manifest {
  main: string;
  contributes: {
    commands: { command: string }[];
    grammars: { path: string; scopeName: string }[];
    snippets: { path: string }[];
    languages: { configuration: string }[];
    configuration: { properties: Record<string, unknown> };
  };
}

const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
);

/** Coleta o que a extensão registrou, para conferir contra o manifesto. */
const registered = {
  commands: [] as string[],
  languages: [] as string[],
  disposables: 0,
};

/** Stub mínimo da API do VS Code — só o que `activate` toca. */
function makeVscodeStub() {
  const noop = () => ({ dispose() {} });
  const registerLanguageFeature = (selector: unknown) => {
    const language =
      typeof selector === 'string' ? selector : (selector as { language?: string })?.language;
    if (language) {
      registered.languages.push(language);
    }
    return { dispose() {} };
  };

  // Sem "parameter properties" (`constructor(public x)`): o modo strip-only do
  // Node não as suporta, porque exigiriam gerar código, não só apagar tipos.
  class Position {
    line: number;
    character: number;
    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  }
  class Range {
    start: unknown;
    end: unknown;
    constructor(startLineOrPos: unknown, startCharOrPos: unknown, endLine?: number, endChar?: number) {
      // O código usa as duas formas: Range(pos, pos) e Range(l1, c1, l2, c2).
      this.start =
        endLine === undefined
          ? startLineOrPos
          : new Position(startLineOrPos as number, startCharOrPos as number);
      this.end =
        endLine === undefined ? startCharOrPos : new Position(endLine, endChar as number);
    }
  }

  return {
    commands: {
      registerCommand(command: string) {
        registered.commands.push(command);
        return { dispose() {} };
      },
    },
    languages: {
      registerDocumentFormattingEditProvider: registerLanguageFeature,
      registerDocumentRangeFormattingEditProvider: registerLanguageFeature,
      registerDocumentLinkProvider: registerLanguageFeature,
      registerDefinitionProvider: registerLanguageFeature,
      registerFoldingRangeProvider: registerLanguageFeature,
      registerDocumentSymbolProvider: registerLanguageFeature,
      registerHoverProvider: registerLanguageFeature,
      registerCompletionItemProvider: registerLanguageFeature,
      registerCodeActionsProvider: registerLanguageFeature,
      createDiagnosticCollection: () => ({
        set() {},
        delete() {},
        dispose() {},
      }),
    },
    workspace: {
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback, update() {} }),
      onDidOpenTextDocument: noop,
      onDidChangeTextDocument: noop,
      onDidCloseTextDocument: noop,
      onDidChangeConfiguration: noop,
      onDidSaveTextDocument: noop,
      createFileSystemWatcher: () => ({
        onDidCreate: noop,
        onDidChange: noop,
        onDidDelete: noop,
        dispose() {},
      }),
      textDocuments: [],
      workspaceFolders: undefined,
      findFiles: async () => [],
      asRelativePath: (p: string) => p,
      openTextDocument: async () => ({}),
      fs: { readFile: async () => new Uint8Array() },
    },
    window: {
      activeTextEditor: undefined,
      showQuickPick: async () => undefined,
      showTextDocument: async () => ({}),
      showInformationMessage() {},
      showWarningMessage() {},
    },
    Uri: { file: (p: string) => ({ fsPath: p, toString: () => p }) },
    Range,
    Position,
    TextEdit: { replace: (range: unknown, newText: string) => ({ range, newText }) },
    Diagnostic: class {
      range: unknown;
      message: string;
      severity: unknown;
      source = '';
      code: unknown;
      constructor(range: unknown, message: string, severity: unknown) {
        this.range = range;
        this.message = message;
        this.severity = severity;
      }
    },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CodeAction: class {
      title: string;
      kind: unknown;
      edit: unknown;
      diagnostics: unknown;
      constructor(title: string, kind: unknown) {
        this.title = title;
        this.kind = kind;
      }
    },
    CodeActionKind: { QuickFix: 'quickfix' },
    WorkspaceEdit: class {
      replace() {}
    },
    CompletionItem: class {
      label: string;
      kind: unknown;
      detail = '';
      documentation: unknown;
      insertText: unknown;
      filterText: unknown;
      constructor(label: string, kind: unknown) {
        this.label = label;
        this.kind = kind;
      }
    },
    CompletionItemKind: { File: 0, Property: 1, Function: 2, Keyword: 3, Variable: 4 },
    FoldingRange: class {
      start: number;
      end: number;
      kind: unknown;
      constructor(start: number, end: number, kind?: unknown) {
        this.start = start;
        this.end = end;
        this.kind = kind;
      }
    },
    FoldingRangeKind: { Comment: 1, Imports: 2, Region: 3 },
    DocumentSymbol: class {
      name: string;
      detail: string;
      kind: unknown;
      range: unknown;
      selectionRange: unknown;
      constructor(name: string, detail: string, kind: unknown, range: unknown, selection: unknown) {
        this.name = name;
        this.detail = detail;
        this.kind = kind;
        this.range = range;
        this.selectionRange = selection;
      }
    },
    SymbolKind: { Class: 4, Module: 1, Variable: 12 },
    Location: class {
      uri: unknown;
      range: unknown;
      constructor(uri: unknown, range: unknown) {
        this.uri = uri;
        this.range = range;
      }
    },
    DocumentLink: class {
      range: unknown;
      target: unknown;
      tooltip = '';
      constructor(range: unknown, target: unknown) {
        this.range = range;
        this.target = target;
      }
    },
    Hover: class {
      contents: unknown;
      constructor(contents: unknown) {
        this.contents = contents;
      }
    },
    MarkdownString: class {
      value = '';
      supportHtml = false;
      appendMarkdown() {
        return this;
      }
      appendCodeblock() {
        return this;
      }
    },
    QuickPickItemKind: { Separator: -1, Default: 0 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  };
}

let extension: { activate: (context: unknown) => void; deactivate: () => void };

before(() => {
  const bundlePath = path.join(REPO_ROOT, manifest.main);
  assert.ok(
    fs.existsSync(bundlePath),
    `${manifest.main} não existe — rode "npm run build" antes dos testes`,
  );

  // Intercepta o require de 'vscode', que só existe dentro do editor.
  const stub = makeVscodeStub();
  const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
  (Module as unknown as { _load: unknown })._load = function (request: string, ...rest: unknown[]) {
    return request === 'vscode' ? stub : load.call(this, request, ...rest);
  };

  extension = require(bundlePath);
});

describe('bundle publicado', () => {
  test('carrega e exporta activate/deactivate', () => {
    assert.equal(typeof extension.activate, 'function');
    assert.equal(typeof extension.deactivate, 'function');
  });

  test('activate registra todos os comandos declarados no manifesto', () => {
    const context = { subscriptions: [] as unknown[] };
    extension.activate(context);
    registered.disposables = context.subscriptions.length;

    const declared = manifest.contributes.commands.map((c) => c.command).sort();
    assert.deepEqual(
      registered.commands.sort(),
      declared,
      'todo comando do manifesto precisa ter um handler, senão a paleta mostra "command not found"',
    );
  });

  test('as features de linguagem são registradas para linx-liquid', () => {
    assert.ok(
      registered.languages.length >= 9,
      'formatação (2), dobra, links, definição, símbolos, hover, completion e code actions',
    );
    assert.deepEqual(
      [...new Set(registered.languages)],
      ['linx-liquid'],
      'nenhuma feature pode vazar para outra linguagem',
    );
  });

  test('tudo que foi registrado entra em subscriptions', () => {
    assert.ok(
      registered.disposables >= registered.commands.length + registered.languages.length,
      'nada pode ficar sem dispose ao desativar a extensão',
    );
  });

  test('deactivate não estoura', () => {
    assert.doesNotThrow(() => extension.deactivate());
  });
});

describe('manifesto', () => {
  test('todo arquivo referenciado existe', () => {
    const referenced = [
      manifest.main,
      ...manifest.contributes.grammars.map((g) => g.path),
      ...manifest.contributes.snippets.map((s) => s.path),
      ...manifest.contributes.languages.map((l) => l.configuration),
    ];
    const missing = referenced.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)));
    assert.deepEqual(missing, []);
  });

  test('os JSON de contribuição são válidos', () => {
    for (const file of [
      ...manifest.contributes.grammars.map((g) => g.path),
      ...manifest.contributes.snippets.map((s) => s.path),
      ...manifest.contributes.languages.map((l) => l.configuration),
    ]) {
      assert.doesNotThrow(
        () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')),
        `${file} deve ser JSON válido`,
      );
    }
  });

  test('cada gramática declara o scopeName que o manifesto promete', () => {
    for (const grammar of manifest.contributes.grammars) {
      const parsed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, grammar.path), 'utf8'));
      assert.equal(
        parsed.scopeName,
        grammar.scopeName,
        `${grammar.path}: scopeName divergente entre o manifesto e a gramática`,
      );
    }
  });

  test('toda configuração lida pelo código está declarada', () => {
    const declared = Object.keys(manifest.contributes.configuration.properties);
    for (const key of [
      'linxLiquid.themeRoot',
      'linxLiquid.sharedThemeRoot',
      'linxLiquid.diagnostics.enabled',
      'linxLiquid.format.attributeIndent',
    ]) {
      assert.ok(declared.includes(key), `${key} precisa aparecer nas configurações da extensão`);
    }
  });
});
