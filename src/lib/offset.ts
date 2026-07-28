/**
 * offset.ts
 * -----------------------------------------------------------------------
 * Lógica compartilhada do comando OFFSET (Deslocar), extraída de
 * `store.ts` na Iteração 37 pra poder ser reaproveitada também em
 * `CanvasStage.tsx` (hover ao vivo ANTES do 1º clique -- ver
 * `geometriaSobCursorOffset` abaixo). Espelha o papel de `lib/trim.ts`
 * pro comando TRIM: um módulo puro (sem Zustand) com as contas de
 * geometria, que tanto o store quanto os componentes de canvas importam.
 *
 * O fluxo completo do OFFSET (ver `store.ts#selecionarAlvoOffset` e
 * `#aplicarOffset`) é:
 *   1) Usuário digita a distância (arma `offsetDistancia`).
 *   2) A CADA mousemove, ANTES do 1º clique, `geometriaSobCursorOffset`
 *      acha a geometria (e a aresta exata dela, se for uma forma
 *      fechada) mais próxima do cursor -- vira o destaque visual
 *      (`offsetHover` no store) que mostra ao usuário QUAL linha vai ser
 *      duplicada se ele clicar agora (pedido do usuário: "o botao
 *      deslocar precisa mostrar que está ativo quando encostar por cima
 *      da linha").
 *   3) 1º clique: `segmentoOffsetAlvo` resolve o segmento definitivo (2
 *      pontos) a partir do objeto clicado + de ONDE foi clicado --
 *      arma `offsetAlvoId`/`offsetAlvoSegmento`.
 *   4) A cada mousemove seguinte (antes do 2º clique), o preview ao vivo
 *      em `GeometryLayer.tsx` usa esse MESMO segmento pra desenhar a
 *      linha paralela do lado em que o cursor está agora (pedido do
 *      usuário: "quando eu arrastar para a direita ou esquerda a linha
 *      duplicada venha antes de eu clicar no local").
 *   5) 2º clique: `aplicarOffset` (em `store.ts`) cria a nova "linha".
 * -----------------------------------------------------------------------
 */

import type { Camada, Geometria } from "./types";
import { resolverCamada } from "./layers";
import { distanciaAoSegmento, type Ponto } from "./geom";
import type { Viewport } from "./snap";

/** Segmento (2 pontos) candidato a ser duplicado pelo OFFSET. */
export interface SegmentoOffset {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Dado uma lista de vértices (`fechado: true` fecha o último vértice de
 * volta ao primeiro -- caso de retângulo/polígono; `false` não -- caso de
 * polilinha), devolve o segmento (par de pontos consecutivos) mais
 * próximo de `alvo`. Usado por `segmentoOffsetAlvo` abaixo pra achar
 * QUAL aresta de uma forma fechada foi clicada/está sob o cursor.
 */
export function segmentoMaisProximo(pontos: Ponto[], alvo: Ponto, fechado: boolean): SegmentoOffset | null {
  const n = pontos.length;
  if (n < 2) return null;
  const totalArestas = fechado ? n : n - 1;
  let melhor: SegmentoOffset | null = null;
  let melhorDist = Infinity;
  for (let i = 0; i < totalArestas; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % n];
    const { dist } = distanciaAoSegmento(alvo, a, b);
    if (dist < melhorDist) {
      melhorDist = dist;
      melhor = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
  }
  return melhor;
}

/**
 * Resolve o segmento (2 pontos) que o OFFSET (Deslocar) deve de fato
 * duplicar, a partir do objeto (`g`) e de ONDE (`ponto`, coordenadas de
 * mundo) -- pra uma "linha" solta é o próprio x1/y1/x2/y2; pra um
 * "retangulo"/"poligono"/"polilinha" fechado é a ARESTA mais próxima de
 * `ponto`. Devolve `null` pra qualquer tipo sem aresta (bloco, texto,
 * círculo, etc.).
 */
export function segmentoOffsetAlvo(g: Geometria, ponto: Ponto): SegmentoOffset | null {
  if (g.tipo === "linha") return { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 };
  if (g.tipo === "retangulo") {
    const cantos: Ponto[] = [
      { x: g.x, y: g.y },
      { x: g.x + g.largura, y: g.y },
      { x: g.x + g.largura, y: g.y + g.altura },
      { x: g.x, y: g.y + g.altura },
    ];
    return segmentoMaisProximo(cantos, ponto, true);
  }
  if (g.tipo === "poligono") return segmentoMaisProximo(g.pontos, ponto, true);
  if (g.tipo === "polilinha") return segmentoMaisProximo(g.pontos, ponto, false);
  return null;
}

/**
 * Iteração 37 -- acha a geometria (visível, com aresta ofertável ao
 * OFFSET) mais próxima do cursor, dentro de uma tolerância em PIXELS de
 * tela (mesmo raio de captura do OSNAP/TRIM, independente do zoom).
 * Usada A CADA mousemove enquanto o usuário ainda não clicou na linha
 * alvo (`!offsetAlvoId`), pra destacar visualmente qual elemento SERIA
 * escolhido num clique agora -- ver `CanvasStage.tsx#handleMouseMove` e
 * o destaque em `GeometryLayer.tsx`.
 */
export function geometriaSobCursorOffset(
  geometria: Geometria[],
  camadas: Record<string, Camada>,
  cursorMundo: Ponto,
  viewport: Viewport,
  toleranciaPx = 8
): { id: string; segmento: SegmentoOffset } | null {
  let melhor: { id: string; segmento: SegmentoOffset; distPx: number } | null = null;

  for (const g of geometria) {
    if (!resolverCamada(camadas, g.camada).visible) continue;
    const segmento = segmentoOffsetAlvo(g, cursorMundo);
    if (!segmento) continue;
    const { dist } = distanciaAoSegmento(
      cursorMundo,
      { x: segmento.x1, y: segmento.y1 },
      { x: segmento.x2, y: segmento.y2 }
    );
    const distPx = dist * viewport.scale;
    if (distPx <= toleranciaPx && (!melhor || distPx < melhor.distPx)) {
      melhor = { id: g.id, segmento, distPx };
    }
  }

  return melhor ? { id: melhor.id, segmento: melhor.segmento } : null;
}
