import { test, describe, type TestContext } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, '..');
export const CORPUS_ROOT = path.join(REPO_ROOT, 'ex');

/**
 * Fixtures versionadas junto com o código, para os testes que **não** precisam do
 * dialeto real — um projeto comum, sem `Pages/` e portanto sem raiz de tema.
 */
export const FIXTURES_ROOT = path.join(REPO_ROOT, 'test', 'fixtures');

export function fixture(relative: string): string {
  return path.join(FIXTURES_ROOT, relative.replace(/\//g, path.sep));
}

/** Caminho absoluto de um arquivo do corpus, a partir da raiz de `ex/`. */
export function corpus(relative: string): string {
  return path.join(CORPUS_ROOT, relative.replace(/\//g, path.sep));
}

export function read(relative: string): string {
  return fs.readFileSync(corpus(relative), 'utf8');
}

/**
 * Arquivo que só existe no corpus completo. Serve de sentinela: se ele está lá,
 * a árvore inteira está.
 */
const CORPUS_ANCHOR = 'Pages/OnePageCheckout/wd.checkout.onepage.template';

/**
 * Motivo do skip, ou `false` quando o corpus está presente.
 *
 * O corpus de `ex/` é código real de cliente e fica fora do repositório (veja o
 * `.gitignore`). Sem esse tratamento, um clone limpo — ou esta máquina depois de
 * a pasta ser trocada — derruba o suite inteiro com `ENOENT` antes do primeiro
 * teste. É o mesmo princípio que os testes de gramática aplicam à ausência do
 * VS Code instalado: quem depende de um recurso externo se pula sozinho.
 */
export const CORPUS_SKIP: string | false = fs.existsSync(corpus(CORPUS_ANCHOR))
  ? false
  : `corpus ausente — ${CORPUS_ANCHOR} não existe em ex/`;

type TestFn = (t: TestContext) => void | Promise<void>;

/** `test` que se pula sozinho quando o corpus não está presente. */
export function corpusTest(name: string, fn: TestFn): void {
  test(name, { skip: CORPUS_SKIP }, fn);
}

/** `describe` cujos testes todos dependem do corpus. */
export function corpusDescribe(name: string, fn: () => void): void {
  describe(name, { skip: CORPUS_SKIP }, fn);
}

/**
 * Registra um teste por arquivo do corpus.
 *
 * Com o corpus ausente registra um único teste pulado, em vez de simplesmente
 * não registrar nada — assim a saída do `node --test` mostra que a cobertura
 * existe e está inativa, e não que ela sumiu.
 */
export function forEachTemplate(name: (file: string) => string, fn: (file: string) => void): void {
  if (CORPUS_SKIP) {
    test('por arquivo do corpus', { skip: CORPUS_SKIP }, () => {});
    return;
  }
  for (const file of allTemplates()) {
    test(name(file), () => fn(file));
  }
}

/** Todos os `.template` de `ex/`, em caminhos relativos a `ex/`. */
export function allTemplates(): string[] {
  if (!fs.existsSync(CORPUS_ROOT)) {
    return [];
  }
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.template')) {
        out.push(path.relative(CORPUS_ROOT, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(CORPUS_ROOT);
  return out.sort();
}

/** Offset do início da linha (1-indexada), opcionalmente somando uma coluna 0-indexada. */
export function offsetOfLine(text: string, line: number, column = 0): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1; i++) {
    offset += lines[i].length + 1;
  }
  return offset + column;
}

/** Conteúdo da linha 1-indexada. */
export function lineAt(text: string, line: number): string {
  return text.split('\n')[line - 1];
}
