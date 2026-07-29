/**
 * trim.ts
 * -----------------------------------------------------------------------
 * Lógica do comando TRIM (Aparar). Estilo AutoCAD "sem seleção de
 * arestas de corte": TODA aresta reta visível funciona como aresta de
 * corte para todas as outras -- basta passar o mouse sobre um segmento e
 * clicar para removê-lo.
 *
 * Iteração 40 (bug reportado pelo usuário -- verbatim: "aparar só esta
 * aceitando se for desenho feito apenas com linha [...] preciso que
 * funcione se for em um retangulo e nao apague o desenho todo"):
 * generalizado pra reconhecer QUALQUER aresta reta -- não só uma "linha"
 * solta, mas também cada aresta de um "retangulo"/"poligono" (fechados)
 * ou "polilinha" (aberta). Uma "aresta" agora é identificada por
 * `{ geometriaId, indiceAresta }` em vez de assumir que o alvo É a
 * própria geometria "linha".
 *
 * O fluxo (ver CanvasStage/GeometryLayer) é:
 *   1) A cada mousemove, `arestaSobCursor` acha a ARESTA mais próxima do
 *      cursor (distância em PIXELS de tela, como o OSNAP), de QUALQUER
 *      geometria com contorno reto.
 *   2) `segmentosDeCorte` calcula os pontos de interseção dessa aresta
 *      com todas as outras arestas visíveis (`todasArestasVisiveis`,
 *      excluindo as da própria forma-alvo) e devolve os sub-segmentos
 *      resultantes, ordenados ao longo da aresta.
 *   3) `segmentoNoParametro` acha qual desses sub-segmentos contém a
 *      projeção do cursor -- esse é o segmento em destaque (e o que
 *      será removido se o usuário clicar).
 *
 * Quando a aresta-alvo pertence a uma forma FECHADA (retângulo/polígono/
 * polilinha), `store.ts#aplicarTrim` "explode" só aquela forma em linhas
 * soltas (uma por aresta) -- as arestas NÃO cortadas viram linhas
 * idênticas ao original (a forma continua com a mesma aparência visual),
 * e só a aresta clicada é substituída pelos pedaços que sobram do corte.
 * O resto do desenho nunca é tocado.
 * -----------------------------------------------------------------------
 */

import type { Camada, Geometria } from "./types";
import { resolverCamada } from "./layers";
import { distanciaAoSegmento, intersecaoSegmentos, type Ponto } from "./geom";
import type { Viewport } from "./snap";

export interface SegmentoCorte {
  t1: number;
  t2: number;
  p1: Ponto;
  p2: Ponto;
}

/** Um segmento reto genérico (2 pontos), sem amarração a nenhum tipo de geometria específico. */
export interface SegmentoReto {
  p1: Ponto;
  p2: Ponto;
}

/**
 * Enumera as arestas retas "aparáveis" de uma geometria: "linha" tem 1
 * aresta (ela mesma); "retangulo"/"poligono" têm N arestas FECHADAS
 * (última volta pro primeiro vértice); "polilinha" tem N-1 arestas
 * ABERTAS (não fecha). Qualquer outro tipo (círculo, arco, texto, bloco,
 * cota, viewport) não tem aresta reta -- devolve `[]`.
 */
export function arestasDe(g: Geometria): SegmentoReto[] {
  if (g.tipo === "linha") return [{ p1: { x: g.x1, y: g.y1 }, p2: { x: g.x2, y: g.y2 } }];
  if (g.tipo === "retangulo") {
    const cantos: Ponto[] = [
      { x: g.x, y: g.y },
      { x: g.x + g.largura, y: g.y },
      { x: g.x + g.largura, y: g.y + g.altura },
      { x: g.x, y: g.y + g.altura },
    ];
    return cantos.map((a, i) => ({ p1: a, p2: cantos[(i + 1) % cantos.length] }));
  }
  if (g.tipo === "poligono") {
    const pts = g.pontos;
    return pts.map((a, i) => ({ p1: a, p2: pts[(i + 1) % pts.length] }));
  }
  if (g.tipo === "polilinha") {
    const pts = g.pontos;
    const segs: SegmentoReto[] = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push({ p1: pts[i], p2: pts[i + 1] });
    return segs;
  }
  return [];
}

/**
 * Divide o segmento `a1`-`a2` nos sub-segmentos delimitados pelas
 * interseções com `outras` (segmentos genéricos, já filtrados para
 * excluir a própria aresta-alvo e as demais arestas da MESMA forma --
 * ver `todasArestasVisiveis`). Sempre inclui os parâmetros 0 e 1 (as
 * extremidades originais), então o resultado tem sempre >= 1 segmento --
 * 1 só segmento significa "sem nenhuma interseção real" (nada pra
 * aparar).
 */
export function segmentosDeCorte(a1: Ponto, a2: Ponto, outras: SegmentoReto[]): SegmentoCorte[] {
  const ts = new Set<number>([0, 1]);

  for (const outra of outras) {
    const inter = intersecaoSegmentos(a1, a2, outra.p1, outra.p2);
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

/** Aresta reta (de QUALQUER geometria com contorno reto) mais próxima do cursor, achada no `arestaSobCursor` abaixo. */
export interface ArestaAlvo {
  geometriaId: string;
  indiceAresta: number;
  p1: Ponto;
  p2: Ponto;
  t: number;
}

/**
 * Acha a aresta reta visível mais próxima do cursor (distância em pixels
 * de tela, independente do zoom -- mesmo raio de captura do OSNAP), de
 * QUALQUER geometria com contorno reto ("linha" solta OU uma aresta de
 * "retangulo"/"poligono"/"polilinha").
 */
export function arestaSobCursor(
  geometria: Geometria[],
  camadas: Record<string, Camada>,
  cursorMundo: Ponto,
  viewport: Viewport,
  toleranciaPx = 8
): ArestaAlvo | null {
  let melhor: (ArestaAlvo & { distPx: number }) | null = null;

  for (const g of geometria) {
    if (!resolverCamada(camadas, g.camada).visible) continue;
    const arestas = arestasDe(g);
    for (let i = 0; i < arestas.length; i++) {
      const { p1, p2 } = arestas[i];
      const { dist, t } = distanciaAoSegmento(cursorMundo, p1, p2);
      const distPx = dist * viewport.scale;
      if (distPx <= toleranciaPx && (!melhor || distPx < melhor.distPx)) {
        melhor = { geometriaId: g.id, indiceAresta: i, p1, p2, t, distPx };
      }
    }
  }

  return melhor ? { geometriaId: melhor.geometriaId, indiceAresta: melhor.indiceAresta, p1: melhor.p1, p2: melhor.p2, t: melhor.t } : null;
}

/**
 * Todas as arestas retas visíveis do projeto, como segmentos "crus" --
 * candidatas a servir de referência de corte pro TRIM. `excluirGeometriaId`
 * (normalmente a própria forma-alvo) tem TODAS as suas arestas excluídas,
 * não só a que está sendo cortada -- os próprios cantos de uma forma
 * (onde 2 arestas se encontram) nunca devem contar como "interseção" pra
 * cortar outra aresta da mesma forma.
 */
export function todasArestasVisiveis(
  geometria: Geometria[],
  camadas: Record<string, Camada>,
  excluirGeometriaId?: string
): SegmentoReto[] {
  const out: SegmentoReto[] = [];
  for (const g of geometria) {
    if (excluirGeometriaId && g.id === excluirGeometriaId) continue;
    if (!resolverCamada(camadas, g.camada).visible) continue;
    out.push(...arestasDe(g));
  }
  return out;
}
