/**
 * Índice do workspace usado pelo autocomplete.
 *
 * Antes esse trabalho acontecia **dentro** de `provideCompletionItems`, com TTL
 * de 30 s: a primeira sugestão depois de cada expiração disparava um `findFiles`
 * mais a leitura de até 500 arquivos, com o menu do editor esperando. Aqui o
 * índice é construído uma vez, compartilhado entre chamadas concorrentes (o
 * cache guarda a `Promise`, não o resultado) e invalidado por evento do sistema
 * de arquivos — não por relógio.
 */

import * as vscode from 'vscode';

/** Teto de arquivos varridos, para não travar num monorepo gigante. */
const MAX_FILES = 500;
const EXCLUDE = '{**/node_modules/**,**/bower_components/**}';

const WIDGET_PROPERTY_RE = /\{\{-?\s*Widget\.(\w+)/g;

let templateFiles: Promise<vscode.Uri[]> | undefined;
let referenced: Promise<Set<string>> | undefined;

/**
 * Mantém a `Promise` no cache, mas não deixa uma falha transitória virar estado
 * permanente: se ela rejeitar, a próxima chamada reconstrói.
 */
function memoize<T>(build: () => Promise<T>, forget: () => void): Promise<T> {
  const pending = build();
  void pending.catch(forget);
  return pending;
}

/** Todos os `.template` do workspace. */
export function templateUris(): Promise<vscode.Uri[]> {
  templateFiles ??= memoize(
    () => Promise.resolve(vscode.workspace.findFiles('**/*.template', EXCLUDE, MAX_FILES)),
    () => {
      templateFiles = undefined;
    },
  );
  return templateFiles;
}

async function collectReferenced(): Promise<Set<string>> {
  const names = new Set<string>();

  const uris = await templateUris();
  const texts = await Promise.all(
    uris.map(async (uri) => {
      try {
        return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      } catch {
        // Arquivo ilegível não impede o resto.
        return '';
      }
    }),
  );

  for (const text of texts) {
    WIDGET_PROPERTY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIDGET_PROPERTY_RE.exec(text)) !== null) {
      names.add(m[1]);
    }
  }
  return names;
}

/** Propriedades de `Widget.` realmente usadas nos templates do workspace. */
export function referencedWidgetProperties(): Promise<Set<string>> {
  referenced ??= memoize(collectReferenced, () => {
    referenced = undefined;
  });
  return referenced;
}

/** Descarta o índice. Chamado quando um `.template` é criado, alterado ou apagado. */
export function clearWidgetIndex(): void {
  templateFiles = undefined;
  referenced = undefined;
}
