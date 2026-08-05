/**
 * Extração das referências a outros arquivos dentro de um `.template`.
 *
 * Puro e sem `vscode`, para ser testável e reaproveitado por links, diagnósticos
 * e autocomplete.
 */

import { scan, regionAt, type Region } from './scanner.ts';

export type ReferenceKind =
  /** `{% include /Pages/... %}` — caminho de fonte, sem aspas e sem extensão. */
  | 'include'
  /** `template="~/Custom/Content/Widgets/<folder>/..."` e `| contentpath` — caminho de deploy. */
  | 'deploy'
  /** `| themepath` — caminho de fonte, já com extensão. */
  | 'theme'
  /** `| sharedthemepath` — fora da árvore do widget. */
  | 'shared';

export interface PathReference {
  kind: ReferenceKind;
  /** Caminho literal, como está escrito no arquivo. */
  path: string;
  /** Offset do início do caminho (sem as aspas). */
  start: number;
  /** Offset do fim do caminho. */
  end: number;
}

const PATTERNS: { kind: ReferenceKind; re: RegExp; group: number }[] = [
  // {% include /Pages/OnePageCheckout/components/basket %}
  // As aspas são opcionais: o corpus Linx escreve sem, mas `{% include "..." %}`
  // é sintaxe válida de Liquid. A backreference exige o fechamento da aspa que
  // abriu — um include com aspa solta não vira referência.
  { kind: 'include', re: /\{%-?\s*include\s+(["']?)([^\s%"']+)\1/g, group: 2 },
  // template="~/Custom/Content/Widgets/checkout.onepage/helpers/register.template"
  { kind: 'deploy', re: /\btemplate\s*=\s*["']([^"']+)["']/gi, group: 1 },
  // {{ 'Widgets/checkout.onepage/Styles/tailwind.css?v=17' | contentpath }}
  { kind: 'deploy', re: /["']([^"']+)["']\s*\|\s*contentpath\b/g, group: 1 },
  // {{ '/Pages/OnePageCheckout/Scripts/main.js' | themepath }}
  { kind: 'theme', re: /["']([^"']+)["']\s*\|\s*themepath\b/g, group: 1 },
  { kind: 'shared', re: /["']([^"']+)["']\s*\|\s*sharedthemepath\b/g, group: 1 },
];

/**
 * Referências a arquivos que estão em Liquid ativo.
 *
 * Ignora o que está dentro de `{% raw %}` (onde `{{ }}` é do Vue e nada disso é
 * resolvido pelo servidor) e dentro de `{% comment %}`.
 */
export function findPathReferences(text: string, regions: Region[] = scan(text)): PathReference[] {
  const out: PathReference[] = [];

  for (const { kind, re, group } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[group];
      if (!value) {
        continue;
      }
      const start = m.index + m[0].indexOf(value);
      const region = regionAt(regions, start)?.kind;
      if (region === 'raw' || region === 'liquid-comment') {
        continue;
      }
      out.push({ kind, path: value, start, end: start + value.length });
    }
  }

  return out.sort((a, b) => a.start - b.start);
}
