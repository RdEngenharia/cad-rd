"use client";

import { Layer, Line } from "react-konva";
import { useMemo } from "react";
import type { Viewport } from "@/lib/snap";
import type { TemaCanvas } from "@/lib/temaCanvas";

interface GridLayerProps {
  viewport: Viewport;
  stageWidth: number;
  stageHeight: number;
  gridSize: number;
  /** Iteração 44 -- tema do fundo do Desenho ("claro"/"escuro", ver `lib/temaCanvas.ts`) -- decide a paleta do grid/eixos abaixo. Default "claro" (comportamento de sempre) quando omitido, pra não quebrar nenhum outro chamador/teste que ainda não passa essa prop. */
  tema?: TemaCanvas;
}

const MAX_LINHAS = 400; // teto de linhas desenhadas por eixo, por performance

// Paleta original, calibrada pro fundo CLARO (`bg-slate-100`) do container --
// ver `CanvasStage.tsx`.
const CORES_CLARO = {
  gridMenor: "#e2e8f0",
  gridMaior: "#94a3b8",
  eixo: "#64748b",
};

// Iteração 44 -- paleta pro fundo ESCURO (`bg-slate-900`): mesma lógica
// (linha maior mais contrastante que a menor, eixo mais contrastante que
// as duas), só invertida pra continuar legível num fundo escuro -- tons
// CLAROS de grid sobre fundo escuro, ao contrário dos tons escuros de
// grid sobre fundo claro.
const CORES_ESCURO = {
  gridMenor: "#334155",
  gridMaior: "#64748b",
  eixo: "#94a3b8",
};

/**
 * GridLayer
 * -----------------------------------------------------------------------
 * Desenha o grid de fundo (linhas menores a cada `gridSize` e linhas
 * maiores a cada 10x isso) e os eixos X/Y na origem, pro Desenho (Model
 * Space) -- um espaço de trabalho conceitualmente infinito, sem tamanho
 * de papel nenhum, igual ao Model Space do AutoCAD.
 *
 * Até a Iteração 12r, este componente também desenhava uma borda
 * tracejada com margens ABNT e o rótulo "Folha Xn (... mm)" por cima do
 * grid, sobrando de uma época (pré-12e) em que o Desenho e a "folha" de
 * impressão eram a mesma coisa. Isso ficou órfão/confuso depois da
 * Iteração 12e (Model Space + Layouts): a referência de papel real
 * (formato, margens, carimbo) já é toda desenhada pelas Pranchas
 * (`PranchaLayer.tsx`/`TitleBlockLayer.tsx`), então mostrar uma folha
 * DE NOVO por cima do Desenho não tinha função nenhuma -- só confundia,
 * já que o Desenho não tem (e nunca teve, na prática) um limite de
 * papel de verdade. Removido a pedido do usuário ("a tela de desenho
 * nao pode ter referencia de folha"): o Desenho agora mostra só o grid
 * e os eixos, sem nenhuma borda/rótulo de papel.
 *
 * Só renderiza o que está dentro da área visível do Stage -- calculado a
 * partir do viewport (zoom/pan) -- para aguentar zooms extremos sem
 * desenhar milhares de linhas fora de tela.
 * -----------------------------------------------------------------------
 */
export function GridLayer({
  viewport,
  stageWidth,
  stageHeight,
  gridSize,
  tema = "claro",
}: GridLayerProps) {
  const { scale, x: offX, y: offY } = viewport;
  const cores = tema === "escuro" ? CORES_ESCURO : CORES_CLARO;

  const bounds = useMemo(() => {
    const left = -offX / scale;
    const top = -offY / scale;
    const right = (stageWidth - offX) / scale;
    const bottom = (stageHeight - offY) / scale;
    return { left, top, right, bottom };
  }, [offX, offY, scale, stageWidth, stageHeight]);

  const linhas = useMemo(() => {
    // Aumenta o espaçamento efetivo em múltiplos de 10 até caber no teto
    // de linhas, evitando um grid ilegível/lento quando o zoom está longe.
    let passo = gridSize;
    const largura = bounds.right - bounds.left;
    while (largura / passo > MAX_LINHAS) passo *= 10;

    const passoMaior = passo * 10;

    const verticais: { x: number; maior: boolean }[] = [];
    const primeiraX = Math.floor(bounds.left / passo) * passo;
    for (let x = primeiraX; x <= bounds.right; x += passo) {
      verticais.push({ x, maior: Math.abs(x % passoMaior) < 1e-6 });
    }

    const horizontais: { y: number; maior: boolean }[] = [];
    const primeiraY = Math.floor(bounds.top / passo) * passo;
    for (let y = primeiraY; y <= bounds.bottom; y += passo) {
      horizontais.push({ y, maior: Math.abs(y % passoMaior) < 1e-6 });
    }

    return { verticais, horizontais };
  }, [bounds, gridSize]);

  return (
    <Layer listening={false}>
      {/* Grid menor/maior */}
      {linhas.verticais.map((v, i) => (
        <Line
          key={`v-${i}`}
          points={[v.x, bounds.top, v.x, bounds.bottom]}
          stroke={v.maior ? cores.gridMaior : cores.gridMenor}
          strokeWidth={(v.maior ? 1 : 0.5) / scale}
        />
      ))}
      {linhas.horizontais.map((h, i) => (
        <Line
          key={`h-${i}`}
          points={[bounds.left, h.y, bounds.right, h.y]}
          stroke={h.maior ? cores.gridMaior : cores.gridMenor}
          strokeWidth={(h.maior ? 1 : 0.5) / scale}
        />
      ))}

      {/* Eixos na origem */}
      <Line points={[bounds.left, 0, bounds.right, 0]} stroke={cores.eixo} strokeWidth={1 / scale} />
      <Line points={[0, bounds.top, 0, bounds.bottom]} stroke={cores.eixo} strokeWidth={1 / scale} />
    </Layer>
  );
}
