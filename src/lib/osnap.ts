/**
 * osnap.ts
 * -----------------------------------------------------------------------
 * OSNAP estilo AutoCAD: ao mover o mouse, procura o ponto "magnético"
 * mais próximo do cursor dentro de um raio de captura (em PIXELS de
 * tela, não em unidades de mundo -- assim o raio continua o mesmo em
 * qualquer zoom). Tipos suportados:
 *   - Endpoint (extremidade de linha/aresta de retângulo-polígono-
 *     polilinha, ou ponta de arco) -- indicador quadrado.
 *   - Midpoint (ponto médio de qualquer segmento/aresta) -- indicador
 *     triangular.
 *   - Center (centro de círculo/arco) -- indicador circular.
 *   - Intersection (cruzamento exato entre dois segmentos quaisquer,
 *     mesmo de elementos diferentes) -- indicador em X.
 * Entre todos os candidatos dentro do raio, o mais próximo do cursor
 * vence -- não há hierarquia fixa entre os tipos.
 *
 * Performance: a varredura de Endpoint/Midpoint/Center é O(n) (um único
 * loop pela geometria visível). A de Intersection seria O(n²) se
 * testasse todo par de segmentos do desenho a cada mousemove -- em vez
 * disso, filtra primeiro (O(n), comparando a distância de CADA segmento
 * ao cursor em coordenadas de TELA) para um pequeno conjunto de
 * candidatos "por perto" e só then roda o O(k²) de pares nesse
 * subconjunto reduzido.
 * -----------------------------------------------------------------------
 */

import type { Camada, Geometria } from "./types";
import { resolverCamada } from "./layers";
import { distanciaAoSegmento, intersecaoSegmentos } from "./geom";
import { snapPoint, worldToScreen, type Viewport } from "./snap";
import { pontosConexaoMundo } from "./blocks";

export interface Ponto {
  x: number;
  y: number;
}

export type TipoOsnap = "endpoint" | "midpoint" | "center" | "intersection";

const RAIO_CAPTURA_PX = 10;

interface Segmento {
  a: Ponto;
  b: Ponto;
}

/** Segmentos "aresta" de uma geometria -- fonte de candidatos Endpoint/Midpoint/Intersection. */
function segmentosDaGeometria(g: Geometria): Segmento[] {
  switch (g.tipo) {
    case "linha":
      return [{ a: { x: g.x1, y: g.y1 }, b: { x: g.x2, y: g.y2 } }];
    case "retangulo": {
      const p1 = { x: g.x, y: g.y };
      const p2 = { x: g.x + g.largura, y: g.y };
      const p3 = { x: g.x + g.largura, y: g.y + g.altura };
      const p4 = { x: g.x, y: g.y + g.altura };
      return [
        { a: p1, b: p2 },
        { a: p2, b: p3 },
        { a: p3, b: p4 },
        { a: p4, b: p1 },
      ];
    }
    case "poligono": {
      const pts = g.pontos;
      const segs: Segmento[] = [];
      for (let i = 0; i < pts.length; i++) segs.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
      return segs;
    }
    case "polilinha": {
      const pts = g.pontos;
      const segs: Segmento[] = [];
      for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1] });
      return segs;
    }
    default:
      return [];
  }
}

/**
 * Procura o ponto "magnético" (Endpoint/Midpoint/Center/Intersection)
 * mais próximo do ponteiro (em coordenadas de tela), dentro do raio de
 * captura. Ignora geometria de camadas invisíveis (o usuário não pode
 * "grudar" no que não está vendo).
 */
export function encontrarPontoMagneticoProximo(
  pointerScreen: Ponto,
  geometria: Geometria[],
  camadas: Record<string, Camada>,
  viewport: Viewport,
  raioPx: number = RAIO_CAPTURA_PX
): { ponto: Ponto; tipo: TipoOsnap } | null {
  let melhor: { ponto: Ponto; tipo: TipoOsnap } | null = null;
  let melhorDist = raioPx;

  function considerar(pontoMundo: Ponto, tipo: TipoOsnap) {
    const tela = worldToScreen(pontoMundo, viewport);
    const d = Math.hypot(tela.x - pointerScreen.x, tela.y - pointerScreen.y);
    if (d < melhorDist) {
      melhorDist = d;
      melhor = { ponto: pontoMundo, tipo };
    }
  }

  const segmentosVisiveis: Segmento[] = [];

  for (const g of geometria) {
    if (!resolverCamada(camadas, g.camada).visible) continue;

    for (const seg of segmentosDaGeometria(g)) {
      segmentosVisiveis.push(seg);
      considerar(seg.a, "endpoint");
      considerar(seg.b, "endpoint");
      considerar({ x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }, "midpoint");
    }

    if (g.tipo === "circulo") {
      considerar({ x: g.x, y: g.y }, "center");
    }
    if (g.tipo === "arco") {
      considerar({ x: g.x, y: g.y }, "center");
      const a0 = (g.anguloInicial * Math.PI) / 180;
      const a1 = (g.anguloFinal * Math.PI) / 180;
      considerar({ x: g.x + g.raio * Math.cos(a0), y: g.y + g.raio * Math.sin(a0) }, "endpoint");
      considerar({ x: g.x + g.raio * Math.cos(a1), y: g.y + g.raio * Math.sin(a1) }, "endpoint");
    }
    if (g.tipo === "bloco") {
      // Terminais elétricos do bloco (Iteração 12f) -- ver
      // `blocks.ts#pontosConexaoMundo`. Só viram candidato "endpoint";
      // não são segmentos, então não entram no pool de Intersection.
      for (const p of pontosConexaoMundo(g)) considerar(p, "endpoint");
    }
  }

  // Intersection: filtra os segmentos "por perto" do cursor em TELA
  // antes do O(k²) de pares -- evita varrer todo par de segmentos do
  // desenho a cada mousemove. O raio de filtragem é mais generoso que o
  // de captura porque a INTERSEÇÃO de dois segmentos pode cair fora do
  // raio de captura de cada segmento individualmente.
  const RAIO_CANDIDATOS_PX = raioPx * 4;
  const candidatos = segmentosVisiveis.filter((seg) => {
    const aTela = worldToScreen(seg.a, viewport);
    const bTela = worldToScreen(seg.b, viewport);
    return distanciaAoSegmento(pointerScreen, aTela, bTela).dist < RAIO_CANDIDATOS_PX;
  });
  for (let i = 0; i < candidatos.length; i++) {
    for (let j = i + 1; j < candidatos.length; j++) {
      const inter = intersecaoSegmentos(candidatos[i].a, candidatos[i].b, candidatos[j].a, candidatos[j].b);
      if (inter) considerar(inter.ponto, "intersection");
    }
  }

  return melhor;
}

/** @deprecated mantido só por compatibilidade de nome -- use `encontrarPontoMagneticoProximo`. */
export function encontrarEndpointProximo(
  pointerScreen: Ponto,
  geometria: Geometria[],
  camadas: Record<string, Camada>,
  viewport: Viewport,
  raioPx: number = RAIO_CAPTURA_PX
): Ponto | null {
  const resultado = encontrarPontoMagneticoProximo(pointerScreen, geometria, camadas, viewport, raioPx);
  return resultado && resultado.tipo === "endpoint" ? resultado.ponto : null;
}

export interface ResultadoAlvo {
  ponto: Ponto;
  /** Tipo de OSNAP quando o ponto veio de um; `null` quando veio do grid/coordenada crua. */
  tipo: TipoOsnap | null;
}

/**
 * Resolve o ponto "alvo" para colocação/preview, na seguinte prioridade:
 *   1) OSNAP (o candidato mais perto do cursor dentro do raio de 10px,
 *      entre Endpoint/Midpoint/Center/Intersection);
 *   2) snap de grid (se ativo);
 *   3) coordenada de mundo crua.
 *
 * Usada tanto no preview (mousemove) quanto na colocação real (click),
 * para que o que o usuário vê seja exatamente o que é gravado.
 */
export function resolverPontoAlvo(
  pointerScreen: Ponto,
  mundo: Ponto,
  geometria: Geometria[],
  camadas: Record<string, Camada>,
  viewport: Viewport,
  gridSize: number,
  snapAtivo: boolean
): ResultadoAlvo {
  const magnetico = encontrarPontoMagneticoProximo(pointerScreen, geometria, camadas, viewport);
  if (magnetico) return { ponto: magnetico.ponto, tipo: magnetico.tipo };

  const ponto = snapAtivo ? snapPoint(mundo, gridSize) : mundo;
  return { ponto, tipo: null };
}
