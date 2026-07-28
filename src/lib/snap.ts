/**
 * snap.ts
 * -----------------------------------------------------------------------
 * Funções puras de apoio geométrico: snap ao grid e conversões entre
 * coordenadas de tela (pixels do Stage) e coordenadas de "mundo" (mm do
 * desenho), levando em conta o zoom/pan atuais.
 * -----------------------------------------------------------------------
 */

export interface Viewport {
  /** Fator de zoom (1 = 100%). */
  scale: number;
  /** Deslocamento (em pixels de tela) da origem do mundo. */
  x: number;
  y: number;
}

/** Arredonda um valor para o múltiplo de `grid` mais próximo. */
export function snapValue(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/** Aplica snap a um ponto {x,y} em coordenadas de mundo. */
export function snapPoint(
  point: { x: number; y: number },
  grid: number
): { x: number; y: number } {
  return { x: snapValue(point.x, grid), y: snapValue(point.y, grid) };
}

/** Converte um ponto de tela (pixels do Stage) para coordenadas de mundo. */
export function screenToWorld(
  screen: { x: number; y: number },
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: (screen.x - viewport.x) / viewport.scale,
    y: (screen.y - viewport.y) / viewport.scale,
  };
}

/** Converte um ponto de mundo para coordenadas de tela (pixels do Stage). */
export function worldToScreen(
  world: { x: number; y: number },
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: world.x * viewport.scale + viewport.x,
    y: world.y * viewport.scale + viewport.y,
  };
}

/** Distância euclidiana entre dois pontos. */
export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
