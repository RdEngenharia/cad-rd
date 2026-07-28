/**
 * geom.ts
 * -----------------------------------------------------------------------
 * Álgebra vetorial 2D pura, sem dependência de estado/React/Konva --
 * base matemática para as ferramentas de precisão (TRIM/OFFSET/FILLET).
 * Tudo em coordenadas de mundo (mm).
 * -----------------------------------------------------------------------
 */

export interface Ponto {
  x: number;
  y: number;
}

export function subtrair(a: Ponto, b: Ponto): Ponto {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function somar(a: Ponto, b: Ponto): Ponto {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function escalar(v: Ponto, k: number): Ponto {
  return { x: v.x * k, y: v.y * k };
}

export function norma(v: Ponto): number {
  return Math.hypot(v.x, v.y);
}

/** Vetor unitário na mesma direção de `v` (retorna (0,0) só se `v` já for nulo). */
export function normalizar(v: Ponto): Ponto {
  const n = norma(v);
  return n < 1e-12 ? { x: 0, y: 0 } : { x: v.x / n, y: v.y / n };
}

export function produtoEscalar(a: Ponto, b: Ponto): number {
  return a.x * b.x + a.y * b.y;
}

/** Componente Z do produto vetorial 2D (útil pra determinar lado/paralelismo). */
export function produtoCruzado(a: Ponto, b: Ponto): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Interseção de duas RETAS INFINITAS que passam por (p1,p2) e (p3,p4).
 * Retorna `null` se forem paralelas (ou coincidentes). Usada pelo FILLET,
 * que precisa do vértice teórico mesmo quando os dois segmentos
 * desenhados não se tocam de fato.
 */
export function intersecaoRetas(p1: Ponto, p2: Ponto, p3: Ponto, p4: Ponto): Ponto | null {
  const d1 = subtrair(p2, p1);
  const d2 = subtrair(p4, p3);
  const denom = produtoCruzado(d1, d2);
  if (Math.abs(denom) < 1e-9) return null;
  const t = produtoCruzado(subtrair(p3, p1), d2) / denom;
  return somar(p1, escalar(d1, t));
}

export interface IntersecaoSegmentos {
  ponto: Ponto;
  /** Parâmetro (0..1) do ponto de interseção ao longo do segmento A. */
  t: number;
  /** Parâmetro (0..1) do ponto de interseção ao longo do segmento B. */
  s: number;
}

/**
 * Interseção de dois SEGMENTOS (limitados pelas suas extremidades, ao
 * contrário de `intersecaoRetas`). Retorna `null` se as retas forem
 * paralelas ou se o cruzamento cair fora de qualquer um dos dois
 * segmentos. Usada pelo TRIM, que só deve cortar em cruzamentos reais.
 */
export function intersecaoSegmentos(a1: Ponto, a2: Ponto, b1: Ponto, b2: Ponto): IntersecaoSegmentos | null {
  const d1 = subtrair(a2, a1);
  const d2 = subtrair(b2, b1);
  const denom = produtoCruzado(d1, d2);
  if (Math.abs(denom) < 1e-9) return null;
  const diff = subtrair(b1, a1);
  const t = produtoCruzado(diff, d2) / denom;
  const s = produtoCruzado(diff, d1) / denom;
  const eps = 1e-6;
  if (t < -eps || t > 1 + eps || s < -eps || s > 1 + eps) return null;
  return { ponto: somar(a1, escalar(d1, t)), t: Math.min(1, Math.max(0, t)), s: Math.min(1, Math.max(0, s)) };
}

export interface PontoNoSegmento {
  dist: number;
  t: number;
  pontoMaisProximo: Ponto;
}

/** Distância (mundo) de `p` ao segmento [a,b], e o `t`/ponto mais próximo. */
export function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): PontoNoSegmento {
  const d = subtrair(b, a);
  const len2 = produtoEscalar(d, d);
  if (len2 < 1e-12) {
    return { dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0, pontoMaisProximo: a };
  }
  let t = produtoEscalar(subtrair(p, a), d) / len2;
  t = Math.min(1, Math.max(0, t));
  const pontoMaisProximo = somar(a, escalar(d, t));
  return { dist: Math.hypot(p.x - pontoMaisProximo.x, p.y - pontoMaisProximo.y), t, pontoMaisProximo };
}

/** Normaliza um ângulo (radianos) para o intervalo [0, 2π). */
export function normalizarAngulo(a: number): number {
  const duasVoltas = Math.PI * 2;
  return ((a % duasVoltas) + duasVoltas) % duasVoltas;
}

/** Normaliza um ângulo (GRAUS) para o intervalo [0, 360) -- usado pelos campos `rotacao` (blocos/texto). */
export function normalizarAnguloGraus(a: number): number {
  return ((a % 360) + 360) % 360;
}

/**
 * Gira `p` em volta de `centro` por `anguloGraus` (sentido horário na
 * tela -- mesma convenção do `rotation` do Konva, já que o mundo do
 * editor usa Y crescendo "para baixo" como o canvas). Usada pela rotação
 * de grupo (Sprint 3: `girarSelecao`) para orbitar cada vértice de cada
 * elemento selecionado em volta do centro combinado da seleção.
 */
export function rotacionarPonto(p: Ponto, centro: Ponto, anguloGraus: number): Ponto {
  const a = (anguloGraus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - centro.x;
  const dy = p.y - centro.y;
  return {
    x: centro.x + dx * cos - dy * sin,
    y: centro.y + dx * sin + dy * cos,
  };
}

/**
 * Dados os dois pontos medidos (p1,p2) de uma COTA (Dimension) e o 3º
 * ponto clicado pelo usuário (p3, que define o deslocamento perpendicular
 * da linha de cota em relação ao segmento medido), devolve os dois
 * pontos (q1,q2) por onde passa a linha de cota em si -- a projeção de
 * p3 sobre a normal do segmento medido, replicada em cada extremidade.
 * As linhas de extensão vão de p1->q1 e de p2->q2.
 */
export function linhaDeCota(p1: Ponto, p2: Ponto, p3: Ponto): { q1: Ponto; q2: Ponto } {
  const d = subtrair(p2, p1);
  const len = norma(d) || 1;
  const n = { x: -d.y / len, y: d.x / len };
  const proj = produtoEscalar(subtrair(p3, p1), n);
  return { q1: somar(p1, escalar(n, proj)), q2: somar(p2, escalar(n, proj)) };
}
