import { CAMADA_FALLBACK, type Camada } from "./types";

/**
 * Resolve o estilo (cor/espessura/visibilidade) de uma camada pelo nome,
 * a partir do dicionário de camadas do projeto. Se a camada referenciada
 * por um elemento não existir mais (ex.: foi apagada), cai num estilo
 * neutro visível em vez de quebrar a renderização.
 */
export function resolverCamada(camadas: Record<string, Camada>, nome: string): Camada {
  return camadas[nome] ?? CAMADA_FALLBACK;
}
