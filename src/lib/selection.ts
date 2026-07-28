/**
 * selection.ts
 * -----------------------------------------------------------------------
 * Matemática pura de seleção por caixa (Window vs. Crossing Select,
 * estilo AutoCAD):
 *   - WINDOW (arraste da ESQUERDA para a DIREITA): seleciona só o que
 *     está 100% CONTIDO na caixa.
 *   - CROSSING (arraste da DIREITA para a ESQUERDA): seleciona qualquer
 *     coisa que esteja contida OU que apenas cruze/toque a caixa.
 *
 * `caixaEnvolvente` calcula a bounding box de cada tipo de geometria --
 * para "arco" a curva é amostrada (mesma técnica de `pdfExport.ts`, ok
 * para fins de seleção), para "bloco" usa as dimensões da definição em
 * `lib/blocks.ts` centradas no ponto de inserção (mesmo sistema de
 * `desenharBloco` em `pdfExport.ts`).
 * -----------------------------------------------------------------------
 */

import type { Geometria } from "./types";
import { getBlockDef } from "./blocks";
import { linhaDeCota } from "./geom";

export interface CaixaEnvolvente {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box (mundo) de uma geometria persistida. */
export function caixaEnvolvente(g: Geometria): CaixaEnvolvente {
  switch (g.tipo) {
    case "linha":
      return {
        minX: Math.min(g.x1, g.x2),
        minY: Math.min(g.y1, g.y2),
        maxX: Math.max(g.x1, g.x2),
        maxY: Math.max(g.y1, g.y2),
      };
    case "circulo":
      return { minX: g.x - g.raio, minY: g.y - g.raio, maxX: g.x + g.raio, maxY: g.y + g.raio };
    case "retangulo":
      return { minX: g.x, minY: g.y, maxX: g.x + g.largura, maxY: g.y + g.altura };
    case "poligono": {
      const xs = g.pontos.map((p) => p.x);
      const ys = g.pontos.map((p) => p.y);
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    case "arco": {
      const passos = 24;
      const a0 = (g.anguloInicial * Math.PI) / 180;
      const a1 = (g.anguloFinal * Math.PI) / 180;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i <= passos; i++) {
        const ang = a0 + ((a1 - a0) * i) / passos;
        const px = g.x + g.raio * Math.cos(ang);
        const py = g.y + g.raio * Math.sin(ang);
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
      return { minX, minY, maxX, maxY };
    }
    case "bloco": {
      const def = getBlockDef(g.nome);
      const largura = (def?.largura ?? 20) * (g.escalaX ?? g.escala ?? 1);
      const altura = (def?.altura ?? 20) * (g.escalaY ?? g.escala ?? 1);
      return {
        minX: g.x - largura / 2,
        minY: g.y - altura / 2,
        maxX: g.x + largura / 2,
        maxY: g.y + altura / 2,
      };
    }
    case "texto": {
      // Aproximação: largura ~ nº de caracteres da MAIOR linha * fração do
      // fontSize (não há medição real de glifo fora do canvas do
      // navegador -- suficiente para decidir contido/cruzado na seleção).
      // Multilinha (Iteração 12h, \n dentro de `conteudo`): cada linha
      // extra soma ~1.2x o fontSize de altura, mesma proporção usada pelo
      // Konva Text (lineHeight padrão) -- mantém a caixa acompanhando a
      // altura real do bloco de texto em vez de só a 1ª linha.
      const linhas = g.conteudo.split("\n");
      const maiorLinha = linhas.reduce((max, l) => Math.max(max, l.length), 0);
      const larguraEstimada = Math.max(g.fontSize, maiorLinha * g.fontSize * 0.6);
      const alturaExtra = (linhas.length - 1) * g.fontSize * 1.2;
      return { minX: g.x, minY: g.y - g.fontSize, maxX: g.x + larguraEstimada, maxY: g.y + g.fontSize * 0.3 + alturaExtra };
    }
    case "cota": {
      const { q1, q2 } = linhaDeCota({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }, { x: g.px, y: g.py });
      const xs = [g.x1, g.x2, q1.x, q2.x];
      const ys = [g.y1, g.y2, q1.y, q2.y];
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    case "polilinha": {
      const xs = g.pontos.map((p) => p.x);
      const ys = g.pontos.map((p) => p.y);
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    case "viewport":
      return { minX: g.x, minY: g.y, maxX: g.x + g.largura, maxY: g.y + g.altura };
  }
}

/**
 * Bounding box combinada de uma lista de geometrias -- usada como
 * ponto-base (centro) por `girarSelecao`/`escalarSelecao` (rotação e
 * escala de grupo) E pelo preview ao vivo da Escala (`GeometryLayer.tsx`,
 * Iteração 12p), que precisa do MESMO centro pra o preview bater exatamente
 * com o resultado depois de "Aplicar". `null` se a lista vier vazia.
 */
export function bboxCombinada(elementos: Geometria[]): CaixaEnvolvente | null {
  if (elementos.length === 0) return null;
  return elementos.reduce(
    (acc, g) => {
      const b = caixaEnvolvente(g);
      return {
        minX: Math.min(acc.minX, b.minX),
        minY: Math.min(acc.minY, b.minY),
        maxX: Math.max(acc.maxX, b.maxX),
        maxY: Math.max(acc.maxY, b.maxY),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

/** `inner` está 100% dentro de `outer` (Window Select). */
export function caixaContida(outer: CaixaEnvolvente, inner: CaixaEnvolvente): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

/** `a` e `b` se sobrepõem (mesmo que parcialmente) -- usado no Crossing Select. */
export function caixasSeCruzam(a: CaixaEnvolvente, b: CaixaEnvolvente): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
