/**
 * trim.ts
 * -----------------------------------------------------------------------
 * Lógica do comando TRIM (Aparar). Estilo AutoCAD "sem seleção de
 * arestas de corte": TODA linha visível funciona como aresta de corte
 * para todas as outras -- basta passar o mouse sobre um segmento e
 * clicar para removê-lo.
 *
 * O fluxo (ver CanvasStage/GeometryLayer) é:
 *   1) A cada mousemove, `linhaSobCursor` acha a linha mais próxima do
 *      cursor (distância em PIXELS de tela, como o OSNAP).
 *   2) `segmentosDeCorte` calcula os pontos de interseção dessa linha
 *      com todas as outras linhas visíveis e devolve os sub-segmentos
 *      resultantes, ordenados ao longo da linha.
 *   3) `segmentoNoParametro` acha qual desses sub-segmentos contém a
 *      projeção do cursor -- esse é o segmento em destaque (e o que
 *      será removido se o usuário clicar).
 * -----------------------------------------------------------------------
 */

import type { Camada, LinhaGeometria } from "./types";
import { resolverCamada } from "./layers";
import { distanciaAoSegmento, intersecaoSegmentos, type Ponto } from "./geom";
import type { Viewport } from "./snap";

export interface SegmentoCorte {
  t1: number;
  t2: number;
  p1: Ponto;
  p2: Ponto;
}

/**
 * Divide `linha` nos sub-segmentos delimitados pelas interseções com
 * `outras` (que já deve vir filtrada para excluir a própria `linha`).
 * Sempre inclui os parâmetros 0 e 1 (as extremidades originais), então
 * o resultado tem sempre >= 1 segmento -- 1 só segmento significa "sem
 * nenhuma interseção real" (nada pra aparar).
 */
export function segmentosDeCorte(linha: LinhaGeometria, outras: LinhaGeometria[]): SegmentoCorte[] {
  const a1: Ponto = { x: linha.x1, y: linha.y1 };
  const a2: Ponto = { x: linha.x2, y: linha.y2 };
  const ts = new Set<number>([0, 1]);

  for (const outra of outras) {
    const b1: Ponto = { x: outra.x1, y: outra.y1 };
    const b2: Ponto = { x: outra.x2, y: outra.y2 };
    const inter = intersecaoSegmentos(a1, a2, b1, b2);
    if (inter && inter.t > 1e-6 && inter.t < 1 - 1e-6) ts.add(inter.t);
  }

  const ordenados = Array.from(ts).sort((x, y) => x - y);
  const segmentos: SegmentoCorte[] = [];
  for (let i = 0; i < ordenados.length - 1; i++) {
    const t1 = ordenados[i];
    const t2 = ordenados[i + 1];
    segmentos.push({
      t1,
      t2,
      p1: { x: a1.x + (a2.x - a1.x) * t1, y: a1.y + (a2.y - a1.y) * t1 },
      p2: { x: a1.x + (a2.x - a1.x) * t2, y: a1.y + (a2.y - a1.y) * t2 },
    });
  }
  return segmentos;
}

/** Índice (dentro de `segmentos`) que contém o parâmetro `t` informado, ou -1. */
export function segmentoNoParametro(segmentos: SegmentoCorte[], t: number): number {
  for (let i = 0; i < segmentos.length; i++) {
    if (t >= segmentos[i].t1 - 1e-6 && t <= segmentos[i].t2 + 1e-6) return i;
  }
  return -1;
}

/**
 * Acha a linha visível mais próxima do cursor (distância em pixels de
 * tela, independente do zoom -- mesmo raio de captura do OSNAP), e o
 * parâmetro `t` do ponto mais próximo nela.
 */
export function linhaSobCursor(
  linhas: LinhaGeometria[],
  camadas: Record<string, Camada>,
  cursorMundo: Ponto,
  viewport: Viewport,
  toleranciaPx = 8
): { linha: LinhaGeometria; t: number } | null {
  let melhor: { linha: LinhaGeometria; t: number; distPx: number } | null = null;

  for (const linha of linhas) {
    if (!resolverCamada(camadas, linha.camada).visible) continue;
    const { dist, t } = distanciaAoSegmento(
      cursorMundo,
      { x: linha.x1, y: linha.y1 },
      { x: linha.x2, y: linha.y2 }
    );
    // A tolerância é definida em pixels de tela -- multiplicar a
    // distância (em mm de mundo) pelo zoom converte pra tela (o
    // viewport não tem rotação, então isso é equivalente a converter
    // os dois pontos com `worldToScreen` e medir lá, só que mais barato).
    const distPx = dist * viewport.scale;
    if (distPx <= toleranciaPx && (!melhor || distPx < melhor.distPx)) {
      melhor = { linha, t, distPx };
    }
  }

  return melhor ? { linha: melhor.linha, t: melhor.t } : null;
}
