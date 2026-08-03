/**
 * Scanner de duas camadas para `.template` da Linx.
 *
 * Reproduz a ordem real de execução do servidor: **o Liquid roda antes do HTML**.
 * Por isso a camada Liquid tem prioridade absoluta e enxerga `{% endraw %}`
 * mesmo quando ele está dentro de uma string de atributo
 * (`wd.checkout.onepage.template:31`) ou dentro de um comentário HTML
 * (`delivery-addresses.template:49-63`, onde o Liquid comentado executa de verdade).
 *
 * Comentar, formatar, dobrar, linkar e diagnosticar dependem daqui.
 */

export type RegionKind =
  /** Liquid server-side ativo. `{{ }}` aqui é Liquid. */
  | 'liquid'
  /** Dentro de `{% raw %}`. `{{ }}` aqui é mustache do Vue e `{% %}` é texto literal. */
  | 'raw'
  /** Dentro de `{% comment %}`: opaco, nada é processado. */
  | 'liquid-comment'
  /** Corpo de `<script>`. */
  | 'script'
  /** Corpo de `<style>`. */
  | 'style'
  /** Dentro de `<!-- -->`. Não impede o Liquid de executar. */
  | 'html-comment';

export interface Region {
  kind: RegionKind;
  /** Offset inicial, inclusivo. */
  start: number;
  /** Offset final, exclusivo. */
  end: number;
}

export interface LiquidTag {
  /** Nome da tag: `if`, `endfor`, `metadata_component`… Vazio para `{{ }}`. */
  name: string;
  /** Conteúdo bruto entre os delimitadores, já sem os `{%`/`%}`. */
  body: string;
  start: number;
  end: number;
  /** `true` para `{{ … }}`, `false` para `{% … %}`. */
  isOutput: boolean;
}

/** Casa `{% raw %}`, `{%raw%}`, `{%- comment -%}` e as variantes de fechamento. */
const BOUNDARY_RE = /\{%-?\s*(raw|endraw|comment|endcomment)\b\s*-?%\}/g;

/**
 * Camada 1 — particiona o texto em `liquid`, `raw` e `liquid-comment`.
 *
 * As tags delimitadoras pertencem sempre à região *de fora*: `{% raw %}` e
 * `{% endraw %}` são Liquid, só o conteúdo entre elas é `raw`.
 */
function scanLiquidLayer(text: string): Region[] {
  const regions: Region[] = [];
  let state: RegionKind = 'liquid';
  let regionStart = 0;

  BOUNDARY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOUNDARY_RE.exec(text)) !== null) {
    const keyword = m[1];
    const tagStart = m.index;
    const tagEnd = m.index + m[0].length;

    if (state === 'liquid') {
      if (keyword === 'raw' || keyword === 'comment') {
        // A tag de abertura fica na região liquid; a nova região começa depois dela.
        regions.push({ kind: 'liquid', start: regionStart, end: tagEnd });
        state = keyword === 'raw' ? 'raw' : 'liquid-comment';
        regionStart = tagEnd;
      }
      // `endraw`/`endcomment` sem abertura correspondente: ignorado aqui,
      // o diagnóstico de desbalanceamento é que reporta.
    } else if (state === 'raw') {
      // Dentro de raw, `comment`/`endcomment` são texto literal — só `endraw` fecha.
      if (keyword === 'endraw') {
        regions.push({ kind: 'raw', start: regionStart, end: tagStart });
        state = 'liquid';
        regionStart = tagStart;
      }
    } else if (state === 'liquid-comment') {
      // Comment é opaco: em register.template:42-47 há um par capture/endcapture
      // inteiro aqui dentro, e um `{% raw %}` aqui não abriria região nenhuma.
      if (keyword === 'endcomment') {
        regions.push({ kind: 'liquid-comment', start: regionStart, end: tagStart });
        state = 'liquid';
        regionStart = tagStart;
      }
    }
  }

  if (regionStart < text.length || regions.length === 0) {
    regions.push({ kind: state, start: regionStart, end: text.length });
  }
  return regions;
}

const SCRIPT_OPEN_RE = /<script\b[^>]*>/gi;
const STYLE_OPEN_RE = /<style\b[^>]*>/gi;
const HTML_COMMENT_OPEN_RE = /<!--/g;

/**
 * Camada 2 — subdivide uma região em `script`, `style` e `html-comment`.
 *
 * Nunca atravessa a fronteira da região recebida: um `<!--` que abre dentro de
 * uma região e só fecharia depois dela termina no limite da região, que é
 * exatamente o que o servidor faz.
 */
function scanHtmlLayer(text: string, region: Region): Region[] {
  const out: Region[] = [];
  const slice = text.slice(region.start, region.end);
  let cursor = 0;

  type Opener = { index: number; length: number; kind: RegionKind; closeRe: RegExp };

  const nextOpener = (from: number): Opener | null => {
    const candidates: Opener[] = [];
    for (const [re, kind, close] of [
      [SCRIPT_OPEN_RE, 'script', /<\/script\s*>/gi],
      [STYLE_OPEN_RE, 'style', /<\/style\s*>/gi],
      [HTML_COMMENT_OPEN_RE, 'html-comment', /-->/g],
    ] as const) {
      re.lastIndex = from;
      const hit = re.exec(slice);
      if (hit) {
        candidates.push({ index: hit.index, length: hit[0].length, kind, closeRe: new RegExp(close) });
      }
    }
    if (candidates.length === 0) {
      return null;
    }
    return candidates.reduce((a, b) => (a.index <= b.index ? a : b));
  };

  let opener = nextOpener(cursor);
  while (opener) {
    const contentStart = opener.index + opener.length;
    opener.closeRe.lastIndex = contentStart;
    const closer = opener.closeRe.exec(slice);
    const contentEnd = closer ? closer.index : slice.length;
    const after = closer ? closer.index + closer[0].length : slice.length;

    if (opener.index > cursor) {
      out.push({ kind: region.kind, start: region.start + cursor, end: region.start + opener.index });
    }
    // A tag de abertura e a de fechamento continuam sendo do tipo externo:
    // é o corpo que recebe tratamento especial.
    out.push({ kind: region.kind, start: region.start + opener.index, end: region.start + contentStart });
    if (contentEnd > contentStart) {
      out.push({ kind: opener.kind, start: region.start + contentStart, end: region.start + contentEnd });
    }
    if (closer) {
      out.push({ kind: region.kind, start: region.start + contentEnd, end: region.start + after });
    }

    cursor = after;
    opener = nextOpener(cursor);
  }

  if (cursor < slice.length) {
    out.push({ kind: region.kind, start: region.start + cursor, end: region.end });
  }
  return out.filter((r) => r.end > r.start);
}

/**
 * Particiona o texto em regiões ordenadas, contíguas e sem sobreposição,
 * cobrindo o documento inteiro.
 */
export function scan(text: string): Region[] {
  const base = scanLiquidLayer(text);
  const out: Region[] = [];
  for (const region of base) {
    if (region.kind === 'liquid-comment') {
      // Opaco: nada aqui dentro é subdividido.
      out.push(region);
    } else {
      out.push(...scanHtmlLayer(text, region));
    }
  }
  return out.filter((r) => r.end > r.start);
}

/** Região que contém o offset. Busca binária; assume regiões ordenadas. */
export function regionAt(regions: Region[], offset: number): Region | undefined {
  let lo = 0;
  let hi = regions.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = regions[mid];
    if (offset < r.start) {
      hi = mid - 1;
    } else if (offset >= r.end) {
      lo = mid + 1;
    } else {
      return r;
    }
  }
  return undefined;
}

/**
 * `true` quando o offset está numa posição onde `{% comment %}` **não** seria
 * processado — dentro de `{% raw %}`. É a checagem que alimenta o diagnóstico
 * do comando de comentar.
 */
export function isInRaw(regions: Region[], offset: number): boolean {
  const r = regionAt(regions, offset);
  if (!r) {
    return false;
  }
  if (r.kind === 'raw') {
    return true;
  }
  // Dentro de <script>/<style>/<!-- --> que por sua vez estão dentro de raw,
  // a região herdou o kind externo, então a checagem acima já cobriu o caso.
  return false;
}

const TAG_RE = /\{\{-?([\s\S]*?)-?\}\}|\{%-?\s*([a-zA-Z_]\w*)?([\s\S]*?)-?%\}/g;

/**
 * Enumera as tags Liquid *ativas* do documento.
 *
 * Ignora o que está dentro de `raw` e de `{% comment %}`, com a exceção
 * deliberada das próprias tags delimitadoras.
 */
export function findLiquidTags(text: string, regions: Region[] = scan(text)): LiquidTag[] {
  const tags: LiquidTag[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text)) !== null) {
    const isOutput = m[1] !== undefined;
    const name = isOutput ? '' : (m[2] ?? '');
    const start = m.index;

    const region = regionAt(regions, start);
    const kind = region?.kind;
    const isBoundaryTag =
      name === 'raw' || name === 'endraw' || name === 'comment' || name === 'endcomment';
    if ((kind === 'raw' || kind === 'liquid-comment') && !isBoundaryTag) {
      continue;
    }

    tags.push({
      name,
      body: isOutput ? m[1].trim() : `${name} ${(m[3] ?? '').trim()}`.trim(),
      start,
      end: start + m[0].length,
      isOutput,
    });
  }
  return tags;
}

/**
 * Índice linha → região dominante, para consumidores que raciocinam por linha
 * (formatador e diagnósticos). Quando uma linha atravessa regiões, vence a que
 * cobre o primeiro caractere não-branco.
 */
export function regionsByLine(text: string, regions: Region[] = scan(text)): RegionKind[] {
  const lines = text.split('\n');
  const out: RegionKind[] = new Array(lines.length);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const firstNonWs = line.search(/\S/);
    const probe = offset + (firstNonWs >= 0 ? firstNonWs : 0);
    out[i] = regionAt(regions, probe)?.kind ?? 'liquid';
    offset += line.length + 1;
  }
  return out;
}
