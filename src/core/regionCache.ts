/**
 * Cache das regiões de um documento, chaveado pela versão dele.
 *
 * Hover, autocomplete, links, dobra e diagnósticos rodavam `scan()` sobre o
 * documento inteiro cada um por conta própria — o hover, a cada movimento do
 * mouse. Como `scan()` é determinístico em cima do texto, o resultado só muda
 * quando a versão do documento muda, e reaproveitá-lo é seguro.
 *
 * A chave e a versão vêm de fora justamente para este módulo não depender de
 * `vscode` e poder ser testado com `node --test`; `src/regionCache.ts` é o
 * adaptador que liga isto ao `TextDocument` do editor.
 */

import { scan, type Region } from './scanner.ts';

export interface CacheableDocument {
  /** Identidade estável do documento — a URI, na prática. */
  key: string;
  /** Muda a cada edição. */
  version: number;
  text: string;
}

export interface RegionCache {
  regions(document: CacheableDocument): Region[];
  clear(): void;
  readonly size: number;
}

/**
 * @param max Quantos documentos manter. O padrão cobre com folga os arquivos
 * abertos ao mesmo tempo num grupo de editores; o excedente sai pelo mais antigo.
 */
export function createRegionCache(max = 8): RegionCache {
  const entries = new Map<string, { version: number; regions: Region[] }>();

  return {
    regions(document) {
      const hit = entries.get(document.key);
      if (hit && hit.version === document.version) {
        // Reinserir move a entrada para o fim da ordem de iteração do Map, que é
        // o que faz o descarte pegar sempre a menos usada recentemente.
        entries.delete(document.key);
        entries.set(document.key, hit);
        return hit.regions;
      }

      const fresh = { version: document.version, regions: scan(document.text) };
      entries.delete(document.key);
      entries.set(document.key, fresh);
      while (entries.size > max) {
        const oldest = entries.keys().next();
        if (oldest.done) {
          break;
        }
        entries.delete(oldest.value);
      }
      return fresh.regions;
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}
