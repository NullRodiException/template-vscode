/**
 * Resolução de caminhos do tema Linx.
 *
 * Dois esquemas de caminho coexistem no mesmo arquivo e resolvem de formas diferentes:
 *
 *  - **fonte** — `{% include /Pages/... %}` e `| themepath` usam o caminho igual ao da
 *    árvore local, relativo à raiz do tema (a pasta que contém `Pages/`).
 *  - **deploy por widget** — `| contentpath` e o argumento `template=` das tags Linx usam
 *    `Widgets/<folder>/...` ou `~/Custom/Content/Widgets/<folder>/...`, onde `<folder>`
 *    é o atributo `folder` do `manifest.xml`. No corpus, `folder="checkout.onepage"`
 *    mapeia `ex/Pages/OnePageCheckout/` ⇒ `Custom/Content/Widgets/checkout.onepage/`.
 *  - **deploy por tema** — `~/Custom/Content/Themes/<tema>/...`, onde `<tema>` é o nome
 *    da pasta do tema. Não passa por manifesto: num clone com `Base/`, `Moda/` e
 *    `Shared/` lado a lado, é como um tema referencia arquivo do outro, e é o único
 *    esquema de deploy que resolve quando não há `manifest.xml` no repositório.
 *
 * Sem dependência de `vscode`, para poder ser testado com `node --test`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ThemeInfo {
  /** Pasta que contém `Pages/`. */
  root: string;
  /** Widgets encontrados sob a raiz, indexados pelo atributo `folder` do manifesto. */
  widgets: Map<string, WidgetInfo>;
}

export interface WidgetInfo {
  /** Valor do atributo `folder` do manifesto, ex. `checkout.onepage`. */
  folder: string;
  /** Diretório que contém o `manifest.xml`. */
  dir: string;
  manifestPath: string;
  /** Propriedades declaradas, que viram `{{ Widget.<nome> }}`. */
  properties: WidgetProperty[];
}

export interface WidgetProperty {
  name: string;
  friendlyName?: string;
  type?: string;
  defaultValue?: string;
}

const themeCache = new Map<string, ThemeInfo | null>();

export function clearThemeCache(): void {
  themeCache.clear();
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** Nome da pasta que é a raiz do tema no repositório de sites. */
const THEME_DIR = 'html';

/**
 * Pastas que denunciam a raiz de um tema que não tem `Pages/` nem `html/`.
 *
 * Sinal fraco de propósito: `Templates/` é nome comum demais para valer sozinho
 * em qualquer lugar. Só entra em jogo quando não há sinal forte em toda a
 * subida, e apenas dentro das pastas do workspace — ver `findThemeRoot`.
 */
const WEAK_ROOT_DIRS = ['Templates', 'Components', 'Configs'];

/** `true` se `dir` é uma das raízes, ou está dentro de uma delas. */
function isInside(dir: string, roots: string[]): boolean {
  return roots.some((root) => {
    const relative = path.relative(root, dir);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

/**
 * Sobe a partir do arquivo até encontrar a raiz do tema. Para no limite do
 * sistema de arquivos.
 *
 * Três árvores chegam aqui, e o sinal de raiz é diferente em cada uma:
 *
 *  - **widget avulso** — a raiz é a pasta que contém `Pages/`.
 *  - **repositório de sites** — cada site tem `<site>/html/`, e é dela que
 *    contam `{% include /Components/… %}` e `| themepath`. Nem todo site tem
 *    `Pages/` (há os que só levam `Components/`), então quem identifica a raiz
 *    é o nome da pasta. Editando um arquivo fora de `html/` — em `src/scss/`,
 *    por exemplo — a raiz ainda é a `html/` irmã.
 *  - **repositório de temas** — um clone com vários temas irmãos na raiz
 *    (`Base/`, `Moda/`, `Shared/`, …), e parte deles sem `Pages/` nem `html/`.
 *    Aí o sinal é `Templates/`, `Components/` ou `Configs/`.
 *
 * O sinal fraco tem duas amarras, porque sozinho ele erraria mais do que acerta:
 *
 *  1. **Só vale dentro do workspace.** Acima da pasta aberta, uma `Templates/`
 *     é coincidência do disco de quem está editando, não raiz de tema. Sem
 *     `workspaceRoots` o sinal fraco nem é considerado, e a função responde
 *     exatamente o que respondia antes de existir.
 *  2. **Vence o mais externo.** Dentro de `Base/` há `widgets/easy.checkout/`,
 *     que também tem `Templates/`; parar nele faria `{% include /Templates/… %}`
 *     contar da pasta errada. O sinal forte continua sendo o mais interno —
 *     `Pages/` só aparece na raiz de verdade.
 */
export function findThemeRoot(
  fromPath: string,
  override?: string,
  workspaceRoots: string[] = [],
): string | undefined {
  if (override) {
    return path.resolve(override);
  }
  const boundaries = workspaceRoots.map((root) => path.resolve(root));
  let dir = isDirectory(fromPath) ? fromPath : path.dirname(fromPath);
  let weak: string | undefined;
  for (let depth = 0; depth < 32; depth++) {
    if (isDirectory(path.join(dir, 'Pages')) || path.basename(dir).toLowerCase() === THEME_DIR) {
      return dir;
    }
    if (isDirectory(path.join(dir, THEME_DIR))) {
      return path.join(dir, THEME_DIR);
    }
    if (
      isInside(path.resolve(dir), boundaries) &&
      WEAK_ROOT_DIRS.some((name) => isDirectory(path.join(dir, name)))
    ) {
      weak = dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return weak;
}

const FOLDER_ATTR_RE = /\bfolder\s*=\s*"([^"]*)"/i;
const PROPERTY_RE = /<property\b([^>]*)\/?>/gi;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

function parseManifest(manifestPath: string): WidgetInfo | undefined {
  let xml: string;
  try {
    xml = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    return undefined;
  }
  const folderMatch = FOLDER_ATTR_RE.exec(xml);
  if (!folderMatch) {
    return undefined;
  }

  const properties: WidgetProperty[] = [];
  PROPERTY_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PROPERTY_RE.exec(xml)) !== null) {
    const attrs: Record<string, string> = {};
    ATTR_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ATTR_RE.exec(pm[1])) !== null) {
      attrs[am[1]] = am[2];
    }
    if (attrs.name) {
      properties.push({
        name: attrs.name,
        friendlyName: attrs.friendlyName,
        type: attrs.type,
        defaultValue: attrs.defaultValue,
      });
    }
  }

  return {
    folder: folderMatch[1],
    dir: path.dirname(manifestPath),
    manifestPath,
    properties,
  };
}

function collectManifests(root: string, out: Map<string, WidgetInfo>, depth = 0): void {
  if (depth > 8) {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === 'manifest.xml') {
      const info = parseManifest(path.join(root, entry.name));
      if (info) {
        out.set(info.folder, info);
      }
    } else if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      collectManifests(path.join(root, entry.name), out, depth + 1);
    }
  }
}

/** Descobre a raiz do tema e indexa os widgets. Resultado cacheado por raiz. */
export function getThemeInfo(
  fromPath: string,
  override?: string,
  workspaceRoots: string[] = [],
): ThemeInfo | undefined {
  const root = findThemeRoot(fromPath, override, workspaceRoots);
  if (!root) {
    return undefined;
  }
  const cached = themeCache.get(root);
  if (cached !== undefined) {
    return cached ?? undefined;
  }
  const widgets = new Map<string, WidgetInfo>();
  collectManifests(root, widgets);
  const info: ThemeInfo = { root, widgets };
  themeCache.set(root, info);
  return info;
}

function firstExisting(...candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (c && fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }
  return undefined;
}

/**
 * Desce `segments` a partir de `base` ignorando maiúsculas e minúsculas.
 *
 * O mesmo arquivo aparece escrito das duas formas no mesmo repositório —
 * `'/Themes/Shared/Imagens/tv_t.jpg'` e `'/themes/base/imagens/payments.png'`.
 * O servidor da Linx e o Windows não distinguem; o Linux da CI distingue, e sem
 * isto metade dos caminhos só resolveria na máquina de quem escreveu.
 *
 * O que volta é sempre a grafia **do disco**, nunca a de quem chamou. Por isso
 * cada segmento passa pelo `readdir` mesmo quando o `existsSync` acertaria de
 * primeira: no Windows ele acerta com qualquer caixa, e o caminho devolvido
 * seguiria adiante escrito errado — para ser comparado com `path.relative` em
 * `toIncludePath` e em `findWidgetFor`, que distinguem.
 */
function walkIgnoringCase(base: string, segments: string[]): string | undefined {
  let current = base;
  for (const segment of segments) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return undefined;
    }
    const lower = segment.toLowerCase();
    const hit =
      entries.find((entry) => entry.name === segment) ??
      entries.find((entry) => entry.name.toLowerCase() === lower);
    if (!hit) {
      return undefined;
    }
    current = path.join(current, hit.name);
  }
  return current;
}

const THEMES_SCHEME_RE = /(?:^|\/)Themes\/(.+)$/i;

/**
 * Resolve o esquema `~/Custom/Content/Themes/<tema>/…`.
 *
 * É o outro esquema de deploy, e não passa por `manifest.xml` nenhum: `<tema>`
 * é o nome da pasta do tema no repositório, então `/Themes/Shared/Imagens/x.jpg`
 * é a `Shared/Imagens/x.jpg` irmã. Num clone com vários temas lado a lado é
 * assim que um tema referencia o outro — e é o único esquema disponível quando
 * o repositório não tem manifesto algum.
 *
 * As bases são a pasta acima da raiz do tema (onde ficam os temas irmãos) e as
 * pastas do workspace.
 */
function resolveThemesScheme(
  deployPath: string,
  bases: string[],
  tryTemplateExtension: boolean,
): string | undefined {
  const match = THEMES_SCHEME_RE.exec(deployPath.split('?')[0].replace(/\\/g, '/'));
  if (!match) {
    return undefined;
  }
  const segments = match[1].split('/').filter((segment) => segment !== '');
  if (segments.length < 2) {
    return undefined;
  }
  const variants = tryTemplateExtension
    ? [[...segments.slice(0, -1), `${segments.at(-1)}.template`], segments]
    : [segments];

  for (const base of bases) {
    for (const variant of variants) {
      const hit = walkIgnoringCase(base, variant);
      if (hit && firstExisting(hit)) {
        return hit;
      }
    }
  }
  return undefined;
}

/**
 * Resolve `{% include /Pages/OnePageCheckout/components/basket %}`.
 *
 * A extensão `.template` é omitida no include e precisa ser recolocada — por isso
 * cada base é testada com a extensão antes de ser testada crua.
 *
 * A raiz do tema tem prioridade, mas não é obrigatória: fora de um tema Linx
 * (nenhuma pasta `Pages/` acima do arquivo) o include ainda resolve contra as
 * pastas do workspace passadas em `extraRoots` e contra o diretório do próprio
 * arquivo. Sem esse fallback, um projeto comum não teria link nenhum.
 */
export function resolveIncludePath(
  includePath: string,
  fromFile: string,
  override?: string,
  extraRoots: string[] = [],
): string | undefined {
  const fromDir = path.dirname(fromFile);
  const native = includePath.replace(/[/\\]/g, path.sep);

  // `./x` e `../x` são explicitamente relativos: só fazem sentido contra o arquivo.
  if (/^\.\.?[/\\]/.test(includePath)) {
    const base = path.resolve(fromDir, native);
    return firstExisting(`${base}.template`, base);
  }

  // A barra inicial é da raiz do tema, não do sistema de arquivos: `path.resolve`
  // aqui apontaria para a raiz do drive.
  const relative = includePath.replace(/^[/\\]+/, '').replace(/[/\\]/g, path.sep);
  const theme = getThemeInfo(fromFile, override, extraRoots);
  const roots = [...(theme ? [theme.root] : []), ...extraRoots, fromDir];

  const hit = firstExisting(
    ...roots.flatMap((root) => {
      const base = path.join(root, relative);
      return [`${base}.template`, base];
    }),
  );
  if (hit) {
    return hit;
  }

  // `{% include ~/custom/content/themes/base/templates/modais/x.template %}`:
  // o include às vezes vem com caminho de deploy, apontando para outro tema.
  return resolveThemesScheme(
    includePath,
    [...(theme ? [path.dirname(theme.root)] : []), ...extraRoots],
    true,
  );
}

/**
 * Caminho de include de um arquivo — a operação inversa de `resolveIncludePath`.
 *
 * `<raiz>/components/index.template` vira `/components/index`: a barra inicial
 * conta da raiz do tema, e a extensão fica de fora porque é o servidor que a
 * recoloca.
 *
 * `undefined` quando o arquivo não é `.template` — `{% include %}` não carrega
 * outra coisa — ou quando está fora da raiz, onde não existe caminho que o
 * servidor saiba resolver.
 */
export function toIncludePath(filePath: string, root: string): string | undefined {
  if (path.extname(filePath).toLowerCase() !== '.template') {
    return undefined;
  }
  const relative = path.relative(root, filePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  const stem = relative.slice(0, -'.template'.length);
  return `/${stem.split(path.sep).join('/')}`;
}

/**
 * Resolve um caminho de **fonte** (`| themepath`), que já vem com extensão e
 * pode carregar querystring de cache-busting.
 */
export function resolveThemePath(
  themePath: string,
  fromFile: string,
  override?: string,
  workspaceRoots: string[] = [],
): string | undefined {
  const theme = getThemeInfo(fromFile, override, workspaceRoots);
  if (!theme) {
    return undefined;
  }
  const clean = themePath.split('?')[0].replace(/^[/\\]+/, '').replace(/[/\\]/g, path.sep);
  return firstExisting(path.join(theme.root, clean));
}

/**
 * Resolve um caminho de **deploy**, nos dois esquemas que existem:
 *
 *  - `Widgets/<folder>/…` e `~/Custom/Content/Widgets/<folder>/…`, onde
 *    `<folder>` vem do `manifest.xml`;
 *  - `~/Custom/Content/Themes/<tema>/…`, onde `<tema>` é a pasta do tema irmão.
 *
 * O segundo é o único que funciona num repositório sem manifesto — e há
 * repositórios de tema assim, com `Base/`, `Moda/` e `Shared/` lado a lado.
 */
export function resolveDeployPath(
  deployPath: string,
  fromFile: string,
  override?: string,
  workspaceRoots: string[] = [],
): string | undefined {
  const theme = getThemeInfo(fromFile, override, workspaceRoots);
  const clean = deployPath.split('?')[0].replace(/\\/g, '/');
  const match = /(?:^|\/)Widgets\/([^/]+)\/(.+)$/.exec(clean);
  if (theme && match) {
    const [, folder, rest] = match;
    const widget = theme.widgets.get(folder);
    if (widget) {
      const base = path.join(widget.dir, rest.replace(/\//g, path.sep));
      const hit = firstExisting(base, `${base}.template`);
      if (hit) {
        return hit;
      }
    }
  }

  return resolveThemesScheme(
    clean,
    [...(theme ? [path.dirname(theme.root)] : []), ...workspaceRoots],
    false,
  );
}

/** Widget que contém o arquivo, subindo até achar um `manifest.xml`. */
export function findWidgetFor(
  filePath: string,
  override?: string,
  workspaceRoots: string[] = [],
): WidgetInfo | undefined {
  const theme = getThemeInfo(filePath, override, workspaceRoots);
  if (!theme) {
    return undefined;
  }
  let best: WidgetInfo | undefined;
  for (const widget of theme.widgets.values()) {
    const rel = path.relative(widget.dir, filePath);
    const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    if (inside && (!best || widget.dir.length > best.dir.length)) {
      best = widget;
    }
  }
  return best;
}

/**
 * Contraparte `.js` de um `.template` de componente, e vice-versa.
 *
 * A convenção é `components/X.template` ↔ `Scripts/components/X.js`. O corpus
 * tem uma exceção: `crediario.template` pareia com `Scripts/crediario.js`, na
 * raiz de `Scripts/`. Por isso a busca tem fallback.
 */
export function findCounterpart(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const stem = path.basename(filePath, path.extname(filePath));
  const dir = path.dirname(filePath);

  if (ext === '.template') {
    const widgetDir = path.dirname(dir);
    const folderName = path.basename(dir);
    return firstExisting(
      path.join(widgetDir, 'Scripts', folderName, `${stem}.js`),
      path.join(widgetDir, 'Scripts', `${stem}.js`),
      path.join(dir, 'Scripts', `${stem}.js`),
      // `wd.checkout.onepage.template` na raiz do widget.
      path.join(dir, 'Scripts', folderName, `${stem}.js`),
    );
  }

  if (ext === '.js') {
    const scriptsIdx = dir.split(path.sep).lastIndexOf('Scripts');
    if (scriptsIdx === -1) {
      return undefined;
    }
    const parts = dir.split(path.sep);
    const widgetDir = parts.slice(0, scriptsIdx).join(path.sep);
    const subPath = parts.slice(scriptsIdx + 1);
    return firstExisting(
      path.join(widgetDir, ...subPath, `${stem}.template`),
      path.join(widgetDir, 'components', `${stem}.template`),
      path.join(widgetDir, `${stem}.template`),
      path.join(widgetDir, 'helpers', `${stem}.template`),
      path.join(widgetDir, 'includes', `${stem}.template`),
    );
  }

  return undefined;
}
