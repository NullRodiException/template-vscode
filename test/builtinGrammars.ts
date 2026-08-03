/**
 * Localiza as gramáticas TextMate que vêm embutidas no VS Code instalado.
 *
 * Carregar `text.html.basic` de verdade é o que torna o teste de gramática fiel:
 * é a sub-regra de string de atributo dela que "prende" o scanner e faz o
 * `{% endraw %}` no meio de um `href="…"` só ser alcançável pela injeção.
 * Sem ela, o teste passaria por um caminho que não existe no editor real.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Raízes prováveis da instalação do VS Code, por plataforma. */
function candidateRoots(): string[] {
  const roots: string[] = [];
  const env = process.env;

  const push = (...parts: (string | undefined)[]) => {
    if (parts.every((p) => p !== undefined)) {
      roots.push(path.join(...(parts as string[])));
    }
  };

  push(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code');
  push(env.ProgramFiles, 'Microsoft VS Code');
  push(env['ProgramFiles(x86)'], 'Microsoft VS Code');
  push(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code Insiders');
  roots.push('/Applications/Visual Studio Code.app/Contents/Resources/app');
  roots.push('/usr/share/code/resources/app');
  push(env.HOME, '.vscode-server');

  return roots.filter((r) => fs.existsSync(r));
}

/** Diretórios `resources/app/extensions`, incluindo o caso da subpasta versionada. */
function extensionDirs(): string[] {
  const found: string[] = [];
  for (const root of candidateRoots()) {
    const direct = path.join(root, 'resources', 'app', 'extensions');
    if (fs.existsSync(direct)) {
      found.push(direct);
      continue;
    }
    // Instalações recentes no Windows guardam tudo sob um diretório com hash da build.
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const nested = path.join(root, entry.name, 'resources', 'app', 'extensions');
      if (fs.existsSync(nested)) {
        found.push(nested);
      }
    }
  }
  return found;
}

let cache: Map<string, string> | undefined;

/**
 * Mapa `scopeName` → caminho do arquivo da gramática.
 * Vazio quando não há VS Code instalado — os testes que dependem disso se
 * declaram como pulados em vez de falhar.
 */
export function builtinGrammars(): Map<string, string> {
  if (cache) {
    return cache;
  }
  const map = new Map<string, string>();

  for (const dir of extensionDirs()) {
    for (const extension of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!extension.isDirectory()) {
        continue;
      }
      const syntaxes = path.join(dir, extension.name, 'syntaxes');
      if (!fs.existsSync(syntaxes)) {
        continue;
      }
      for (const file of fs.readdirSync(syntaxes)) {
        if (!file.endsWith('.tmLanguage.json')) {
          continue;
        }
        const full = path.join(syntaxes, file);
        try {
          const scopeName = JSON.parse(fs.readFileSync(full, 'utf8')).scopeName;
          if (typeof scopeName === 'string' && !map.has(scopeName)) {
            map.set(scopeName, full);
          }
        } catch {
          // Gramática ilegível não impede as outras.
        }
      }
    }
  }

  cache = map;
  return map;
}
