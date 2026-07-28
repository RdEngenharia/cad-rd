/**
 * grips.ts
 * -----------------------------------------------------------------------
 * Edição por vértices (STRETCH & GRIPS, estilo AutoCAD): funções puras
 * que sabem, para os tipos de geometria "editáveis por vértice" (linha,
 * retângulo, polígono, polilinha), onde ficam os grips (pontinhos
 * clicáveis) e como aplicar o arrasto de um deles. Sem dependência de
 * React/Konva/store -- usado tanto pelo `store.ts` (commit real) quanto
 * por `GeometryLayer.tsx` (posição dos grips + preview "fantasma" ao
 * vivo durante o arrasto).
 * -----------------------------------------------------------------------
 */

import type { Geometria } from "./types";

export interface Ponto {
  x: number;
  y: number;
}

/**
 * Pontos de grip (vértices editáveis) de uma geometria, na ORDEM que
 * corresponde ao índice usado por `aplicarStretchNaGeometria`. `null`
 * para tipos que não suportam STRETCH por vértice nesta versão (círculo,
 * arco, texto, cota -- cada um teria uma semântica de "arrasto"
 * diferente, fora do escopo desta Sprint).
 *
 * "bloco" (Iteração 12f, pedido explícito do usuário -- "falta o
 * triângulo no local de seleção para mover o bloco igual o autocad"):
 * um único grip no PONTO DE INSERÇÃO (`geo.x, geo.y`) -- arrastar esse
 * grip move o bloco inteiro (não redimensiona nada, um bloco não tem
 * "vértices" próprios), o mesmo efeito visual do grip azul de inserção
 * do AutoCAD.
 */
export function gripsDeGeometria(g: Geometria): Ponto[] | null {
  switch (g.tipo) {
    case "linha":
      return [
        { x: g.x1, y: g.y1 },
        { x: g.x2, y: g.y2 },
      ];
    case "retangulo":
    case "viewport":
      return [
        { x: g.x, y: g.y },
        { x: g.x + g.largura, y: g.y },
        { x: g.x + g.largura, y: g.y + g.altura },
        { x: g.x, y: g.y + g.altura },
      ];
    case "poligono":
    case "polilinha":
      return g.pontos;
    case "bloco":
      return [{ x: g.x, y: g.y }];
    default:
      return null;
  }
}

/**
 * Devolve uma CÓPIA da geometria com o vértice `indice` movido para
 * `ponto`. Para "retangulo" (que não guarda 4 cantos soltos, e sim
 * x/y/largura/altura), reconstrói o retângulo a partir dos 4 cantos
 * conceituais com o canto arrastado substituído -- mantém a invariante
 * de que `largura`/`altura` são sempre >= 0 mesmo que o usuário arraste
 * um canto "para o lado errado" (o retângulo se re-normaliza sozinho).
 * Geometrias sem grips (ver `gripsDeGeometria`) voltam inalteradas.
 */
export function aplicarStretchNaGeometria(g: Geometria, indice: number, ponto: Ponto): Geometria {
  if (g.tipo === "linha") {
    return indice === 0 ? { ...g, x1: ponto.x, y1: ponto.y } : { ...g, x2: ponto.x, y2: ponto.y };
  }
  // "viewport" redimensiona exatamente como "retangulo" (o retângulo na
  // folha é que muda) -- `modelScale`/`modelOffsetX/Y` (a "câmera" do
  // que aparece dentro) ficam intactos, então redimensionar só
  // corta/estende a área de papel visível, sem mudar o enquadramento do
  // que está sendo mostrado.
  if (g.tipo === "retangulo" || g.tipo === "viewport") {
    const cantos: Ponto[] = [
      { x: g.x, y: g.y },
      { x: g.x + g.largura, y: g.y },
      { x: g.x + g.largura, y: g.y + g.altura },
      { x: g.x, y: g.y + g.altura },
    ];
    cantos[indice] = ponto;
    const xs = cantos.map((p) => p.x);
    const ys = cantos.map((p) => p.y);
    return {
      ...g,
      x: Math.min(...xs),
      y: Math.min(...ys),
      largura: Math.max(...xs) - Math.min(...xs),
      altura: Math.max(...ys) - Math.min(...ys),
    };
  }
  if (g.tipo === "poligono" || g.tipo === "polilinha") {
    return { ...g, pontos: g.pontos.map((p, i) => (i === indice ? ponto : p)) };
  }
  // "bloco": o único grip (índice 0) É o ponto de inserção -- arrastar
  // pra um novo ponto simplesmente move o bloco pra lá (ver comentário em
  // `gripsDeGeometria`).
  if (g.tipo === "bloco") {
    return { ...g, x: ponto.x, y: ponto.y };
  }
  return g;
}

/**
 * Iteração 22: STRETCH pelo PONTO MÉDIO de uma aresta de retângulo --
 * pedido do usuário ("no autocad tambem tenho a opcao no centro das
 * linhas dos quadrados ou retangulos"), que só tinha os 4 grips de CANTO
 * (`aplicarStretchNaGeometria`, que sempre mexe nas duas dimensões de uma
 * vez, já que reconstrói o retângulo a partir do canto OPOSTO fixo).
 * Diferente do canto, o grip do MEIO de uma aresta deve travar o
 * movimento no eixo PERPENDICULAR à aresta -- arrastar o meio da aresta
 * de CIMA/BAIXO (arestas 0/2, ambas horizontais) só deve mudar a ALTURA
 * (eixo Y), preservando a LARGURA; arrastar o meio da aresta da ESQUERDA/
 * DIREITA (arestas 1/3, verticais) só deve mudar a LARGURA (eixo X),
 * preservando a ALTURA -- exatamente o comportamento dos grips de meio-
 * de-aresta do AutoCAD/PowerPoint, complementar ao grip de canto (que
 * continua livre nos dois eixos).
 *
 * Implementado reconstruindo os 4 cantos como em `aplicarStretchNaGeometria`
 * e substituindo os DOIS cantos que formam a aresta arrastada, mas
 * travando a coordenada que corre AO LONGO da aresta (cada canto mantém
 * sua própria coordenada nesse eixo) e só aplicando a coordenada nova do
 * `ponto` recebido no eixo perpendicular -- a normalização final (min/max
 * dos 4 cantos) é a mesma de `aplicarStretchNaGeometria`, então um
 * arrasto que "vira do avesso" a aresta (ex.: puxar o topo pra baixo da
 * base) se recompõe sozinho como qualquer STRETCH de canto já fazia.
 *
 * `indiceSegmento` é o MESMO índice de `GripIntermediario.indiceSegmento`
 * (o segmento `i` liga o vértice `i` ao vértice `i+1`, ver
 * `gripsIntermediariosDeGeometria`) -- para "poligono"/"polilinha" (formas
 * livres, sem eixo X/Y fixo por natureza) esta função não se aplica e
 * devolve `g` inalterada; essas continuam usando só o clique simples de
 * `inserirVerticeNoMeio` no seu grip intermediário, sem esta variante de
 * arrasto.
 *
 * NÃO cobre "viewport": um viewport dentro de uma Prancha (o caso comum,
 * praticamente 100% do uso real -- ver `PranchaLayer.tsx#PranchaViewport`)
 * usa um sistema de grips TOTALMENTE separado (Circles arrastáveis nativos
 * do Konva nos 4 cantos, sem grip de meio-de-aresta nenhum), que este
 * arquivo não toca. Um "viewport" solto em `projeto.geometria` (sem
 * Prancha ativa) é um caso raro que passaria por aqui tecnicamente, mas
 * cobrir só essa exceção deixaria a feature funcionando de forma
 * inconsistente (funciona no caso raro, nada muda no caso comum) -- por
 * isso o escopo desta iteração ficou só em "retangulo", como o usuário
 * pediu literalmente ("quadrados ou retangulos").
 */
export function aplicarStretchArestaNaGeometria(g: Geometria, indiceSegmento: number, ponto: Ponto): Geometria {
  if (g.tipo !== "retangulo") return g;
  const cantos: Ponto[] = [
    { x: g.x, y: g.y },
    { x: g.x + g.largura, y: g.y },
    { x: g.x + g.largura, y: g.y + g.altura },
    { x: g.x, y: g.y + g.altura },
  ];
  const a = indiceSegmento;
  const b = (indiceSegmento + 1) % cantos.length;
  // Arestas 0 (topo) e 2 (base) ligam dois cantos com o MESMO y -- são
  // horizontais, então o arrasto deve mexer só em Y. Arestas 1 (direita) e
  // 3 (esquerda) são verticais, arrasto só em X.
  const horizontal = a === 0 || a === 2;
  if (horizontal) {
    cantos[a] = { x: cantos[a].x, y: ponto.y };
    cantos[b] = { x: cantos[b].x, y: ponto.y };
  } else {
    cantos[a] = { x: ponto.x, y: cantos[a].y };
    cantos[b] = { x: ponto.x, y: cantos[b].y };
  }
  const xs = cantos.map((p) => p.x);
  const ys = cantos.map((p) => p.y);
  return {
    ...g,
    x: Math.min(...xs),
    y: Math.min(...ys),
    largura: Math.max(...xs) - Math.min(...xs),
    altura: Math.max(...ys) - Math.min(...ys),
  };
}

/** Um grip "intermediário" (ponto médio de uma aresta) -- ver `gripsIntermediariosDeGeometria`. */
export interface GripIntermediario {
  ponto: Ponto;
  /**
   * Índice do SEGMENTO (não do vértice): o segmento `i` liga o vértice
   * `i` ao vértice `i+1` (com wraparound pro vértice 0 em formas
   * fechadas). É o índice esperado por `inserirVerticeNoMeio` no store.
   */
  indiceSegmento: number;
}

/**
 * Pontos médios de cada aresta de uma geometria "editável por vértice"
 * fechada/aberta com >= 2 vértices -- desenhados como grips ocos
 * (diferentes dos grips sólidos de `gripsDeGeometria`) que, ao serem
 * clicados, cravam um vértice novo bem naquele meio da aresta (ver
 * `inserirVerticeNoMeio` no store). `null` para tipos sem essa edição
 * nesta versão (linha -- só tem 1 aresta, não faz muito sentido; círculo/
 * arco/bloco/texto/cota, mesmo motivo de `gripsDeGeometria`).
 */
export function gripsIntermediariosDeGeometria(g: Geometria): GripIntermediario[] | null {
  // "retangulo" (Iteração 22): mesma malha de 4 cantos de `gripsDeGeometria`,
  // usada agora também pro STRETCH de meio-de-aresta
  // (`aplicarStretchArestaNaGeometria`), não só pra inserir vértice --
  // `null` pra "viewport" de propósito (ver comentário grande em
  // `aplicarStretchArestaNaGeometria` sobre por que esta iteração não
  // cobre viewport: o caso comum -- viewport dentro de uma Prancha -- usa
  // um sistema de grips totalmente separado em `PranchaLayer.tsx`, e
  // cobrir só o caso raro de viewport solto no Desenho deixaria a feature
  // inconsistente).
  if (g.tipo === "retangulo") {
    const cantos = gripsDeGeometria(g) as Ponto[];
    return cantos.map((c, i) => {
      const prox = cantos[(i + 1) % cantos.length];
      return { ponto: { x: (c.x + prox.x) / 2, y: (c.y + prox.y) / 2 }, indiceSegmento: i };
    });
  }
  if (g.tipo === "poligono") {
    return g.pontos.map((p, i) => {
      const prox = g.pontos[(i + 1) % g.pontos.length];
      return { ponto: { x: (p.x + prox.x) / 2, y: (p.y + prox.y) / 2 }, indiceSegmento: i };
    });
  }
  if (g.tipo === "polilinha") {
    if (g.pontos.length < 2) return [];
    return g.pontos.slice(0, -1).map((p, i) => {
      const prox = g.pontos[i + 1];
      return { ponto: { x: (p.x + prox.x) / 2, y: (p.y + prox.y) / 2 }, indiceSegmento: i };
    });
  }
  return null;
}
