import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, '..');
export const CORPUS_ROOT = path.join(REPO_ROOT, 'ex');

/** Caminho absoluto de um arquivo do corpus, a partir da raiz de `ex/`. */
export function corpus(relative: string): string {
  return path.join(CORPUS_ROOT, relative.replace(/\//g, path.sep));
}

export function read(relative: string): string {
  return fs.readFileSync(corpus(relative), 'utf8');
}

/** Todos os `.template` de `ex/`, em caminhos relativos a `ex/`. */
export function allTemplates(): string[] {
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
