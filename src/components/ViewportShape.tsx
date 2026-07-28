"use client";

import { Group, Line, Circle, Rect, Text, Image as KonvaImage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { resolverCamada } from "@/lib/layers";
import { linhaDeCota } from "@/lib/geom";
import { estiloHachuraKonva } from "@/lib/hachura";
import { useImage } from "@/lib/useImage";
import { BlocoShape } from "./BlocoShape";
import { ArcoShape } from "./ArcoShape";
import type { Camada, Geometria, ViewportGeometria, XRef } from "@/lib/types";
import { PADRAO_TRACEJADO_MM } from "@/lib/types";

interface ViewportShapeProps {
  geo: ViewportGeometria;
  /** Geometria INTEIRA do projeto (pra desenhar dentro do viewport uma vista independente do mesmo mundo compartilhado). */
  geometriaCompleta: Geometria[];
  camadas: Record<string, Camada>;
  /**
   * XREFs (imagens de fundo) a espelhar dentro do viewport, ATRÁS da
   * geometria -- opcional (default `[]`, comportamento de sempre) porque
   * um viewport MV do Desenho (Sprint 5, via `GeometryLayer.tsx`) nunca
   * passou isso; um Viewport de PRANCHA (Iteração 12g, via
   * `PranchaLayer.tsx`) passa `projeto.xrefs` pra reproduzir o mesmo
   * pano de fundo que aparecia na câmera única antiga da Prancha.
   */
  xrefs?: XRef[];
  /** Escala do Stage principal (px de tela por unidade de mundo). */
  scale: number;
  selecionado: boolean;
  /** `true` quando este é o viewport em "Model Ativo" (ver `viewportAtivoId` no store). */
  ativo: boolean;
  onClick: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
}

const NOOP = () => {};

/** Espelho somente-leitura de um XRef dentro de um viewport -- mesmo raciocínio de `desenharSomenteLeitura`, mas para imagem de fundo em vez de geometria. */
function ViewportXrefImage({ xref }: { xref: XRef }) {
  const img = useImage(xref.objectUrl);
  if (xref.visivel === false || !img) return null;
  return (
    <KonvaImage
      image={img}
      x={xref.x}
      y={xref.y}
      width={xref.largura_px * xref.escala}
      height={xref.altura_px * xref.escala}
      opacity={1}
      listening={false}
    />
  );
}

/**
 * Desenha UMA geometria em modo somente-leitura (sem onClick/seleção),
 * usada só para o conteúdo "espelhado" dentro de um Viewport --
 * deliberadamente simplificada (sem grips, sem preview, sem hit-test)
 * porque selecionar/editar sempre acontece pela geometria real no
 * canvas principal, nunca através do reflexo do viewport.
 * `escala` aqui já é a escala EFETIVA (Stage × 1/modelScale) -- ver
 * comentário em `ViewportShape` sobre por que a espessura de linha
 * precisa considerar as DUAS transformações compostas (a do Group da
 * "câmera local" do viewport + a do Stage).
 */
export function desenharSomenteLeitura(g: Geometria, camada: Camada, escala: number) {
  const largura = camada.espessuraDaLinha / escala;
  const hit = 0; // sem hit-test (listening=false no Group pai já cobre isso).
  const dash: [number, number] | undefined =
    camada.estiloLinha === "tracejada" ? [PADRAO_TRACEJADO_MM[0] / escala, PADRAO_TRACEJADO_MM[1] / escala] : undefined;

  if (g.tipo === "linha") {
    return <Line key={g.id} points={[g.x1, g.y1, g.x2, g.y2]} stroke={camada.cor} strokeWidth={largura} dash={dash} lineCap="round" listening={false} />;
  }
  if (g.tipo === "circulo") {
    return (
      <Circle
        key={g.id}
        x={g.x}
        y={g.y}
        radius={g.raio}
        stroke={camada.cor}
        strokeWidth={largura}
        dash={dash}
        {...estiloHachuraKonva(g.hachura)}
        listening={false}
      />
    );
  }
  if (g.tipo === "bloco") {
    return <BlocoShape key={g.id} geo={g} scale={escala} selecionado={false} onClick={NOOP} />;
  }
  if (g.tipo === "retangulo") {
    // Iteração 16: mesmo tratamento de `GeometryLayer.tsx#dashDoRetangulo`
    // -- `tracejado` no próprio retângulo tem prioridade sobre o
    // `estiloLinha` da camada (usado pelas caixas do gerador de diagrama
    // FV, que ficam na camada "0" de traço contínuo).
    const dashRetangulo = g.tracejado
      ? ([PADRAO_TRACEJADO_MM[0] / escala, PADRAO_TRACEJADO_MM[1] / escala] as [number, number])
      : dash;
    return (
      <Rect
        key={g.id}
        x={g.x}
        y={g.y}
        width={g.largura}
        height={g.altura}
        stroke={camada.cor}
        strokeWidth={largura}
        dash={dashRetangulo}
        {...estiloHachuraKonva(g.hachura)}
        listening={false}
      />
    );
  }
  if (g.tipo === "poligono") {
    return (
      <Line
        key={g.id}
        points={g.pontos.flatMap((p) => [p.x, p.y])}
        closed
        stroke={camada.cor}
        strokeWidth={largura}
        dash={dash}
        {...estiloHachuraKonva(g.hachura)}
        listening={false}
      />
    );
  }
  if (g.tipo === "arco") {
    return <ArcoShape key={g.id} geo={g} stroke={camada.cor} strokeWidth={largura} hitStrokeWidth={hit} dash={dash} onClick={NOOP} />;
  }
  if (g.tipo === "texto") {
    return (
      <Text key={g.id} x={g.x} y={g.y} text={g.conteudo} fontSize={g.fontSize} rotation={g.rotacao ?? 0} fill={camada.cor} listening={false} />
    );
  }
  if (g.tipo === "cota") {
    const { q1, q2 } = linhaDeCota({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }, { x: g.px, y: g.py });
    return (
      <Group key={g.id} listening={false}>
        <Line points={[g.x1, g.y1, q1.x, q1.y]} stroke={camada.cor} strokeWidth={largura} dash={dash} />
        <Line points={[g.x2, g.y2, q2.x, q2.y]} stroke={camada.cor} strokeWidth={largura} dash={dash} />
        <Line points={[q1.x, q1.y, q2.x, q2.y]} stroke={camada.cor} strokeWidth={largura} dash={dash} />
        <Text x={(q1.x + q2.x) / 2} y={(q1.y + q2.y) / 2 - 12 / escala} text={g.texto} fontSize={9 / escala} fill={camada.cor} />
      </Group>
    );
  }
  if (g.tipo === "polilinha") {
    return (
      <Line
        key={g.id}
        points={g.pontos.flatMap((p) => [p.x, p.y])}
        stroke={camada.cor}
        strokeWidth={largura}
        dash={dash}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
    );
  }
  return null;
}

/**
 * ViewportShape
 * -----------------------------------------------------------------------
 * Renderiza um elemento `tipo: "viewport"` (Sprint 5, comando MV/MVIEW):
 * uma "janela mágica" retangular na prancha que mostra uma vista
 * independente (escala/pan própria) do MESMO mundo compartilhado de
 * geometria do projeto -- não uma cópia dos dados, só uma re-projeção.
 *
 * Implementado como DOIS Groups aninhados:
 *   1. Um Group externo com `clipFunc` recortando exatamente o
 *      retângulo do viewport (em coordenadas de papel/mundo, já que
 *      esse Group não tem transform próprio).
 *   2. Um Group interno com a "câmera local" do viewport
 *      (`x=geo.x, y=geo.y, scale=1/modelScale, offset=modelOffset`) --
 *      qualquer ponto do mundo `p` dentro dele acaba desenhado em
 *      `geo.x + (p - modelOffset) / modelScale`, ou seja, exatamente o
 *      pedaço do mundo a partir de `modelOffset` reescalado pra caber
 *      no retângulo do viewport na proporção `1:modelScale`.
 * Dentro do Group interno, TODA a geometria do projeto (exceto este
 * próprio viewport e outros viewports, pra não aninhar recursivamente)
 * é redesenhada em modo somente-leitura via `desenharSomenteLeitura`.
 *
 * A borda do retângulo (e o rótulo de escala) fica FORA dos dois Groups
 * -- sempre visível/selecionável no editor independente do que está
 * mostrando por dentro (o campo `bordaVisivel` só afeta se a borda sai
 * ou não no PDF exportado, ver `pdfExport.ts`).
 * -----------------------------------------------------------------------
 */
export function ViewportShape({ geo, geometriaCompleta, camadas, xrefs = [], scale, selecionado, ativo, onClick }: ViewportShapeProps) {
  const modelScale = geo.modelScale || 1;
  // Escala EFETIVA do conteúdo interno: a composição do zoom do Stage
  // principal com a escala PRÓPRIA do Group da câmera local
  // (1/modelScale) -- usada em vez de `scale` sempre que uma espessura/
  // tamanho precisa ficar visualmente constante em pixels de tela,
  // dentro do conteúdo espelhado.
  const escalaEfetiva = scale / modelScale;

  return (
    <>
      <Group clipFunc={(ctx) => ctx.rect(geo.x, geo.y, geo.largura, geo.altura)}>
        <Group x={geo.x} y={geo.y} scaleX={1 / modelScale} scaleY={1 / modelScale} offsetX={geo.modelOffsetX} offsetY={geo.modelOffsetY} listening={false}>
          {xrefs.map((x) => (
            <ViewportXrefImage key={x.id} xref={x} />
          ))}
          {geometriaCompleta
            .filter((g) => g.id !== geo.id && g.tipo !== "viewport")
            .map((g) => {
              const camada = resolverCamada(camadas, g.camada);
              if (!camada.visible) return null;
              return desenharSomenteLeitura(g, camada, escalaEfetiva);
            })}
        </Group>
      </Group>

      {ativo && (
        <Rect x={geo.x} y={geo.y} width={geo.largura} height={geo.altura} fill="#7c3aed" opacity={0.06} listening={false} />
      )}

      {/* Borda do retângulo -- sempre desenhada no editor (clicável pra
          seleção/grips), independente de `bordaVisivel` (que só controla
          o PDF exportado). Cor/traço mudam pra sinalizar "Model Ativo". */}
      <Rect
        x={geo.x}
        y={geo.y}
        width={geo.largura}
        height={geo.altura}
        stroke={selecionado ? "#2563eb" : ativo ? "#7c3aed" : "#64748b"}
        strokeWidth={(ativo ? 2.2 : selecionado ? 1.6 : 1) / scale}
        dash={ativo ? undefined : [6 / scale, 4 / scale]}
        hitStrokeWidth={Math.max(10 / scale, 6)}
        fillEnabled={false}
        onClick={onClick}
        onTap={onClick}
      />
      <Text
        x={geo.x + 2 / scale}
        y={geo.y + geo.altura + 1 / scale}
        text={`ESC 1:${Math.round(modelScale)}${ativo ? " — MODEL ATIVO (clique 2x fora p/ sair)" : ""}${geo.bordaVisivel ? "" : " (borda oculta no PDF)"}`}
        fontSize={8 / scale}
        fill={ativo ? "#7c3aed" : "#64748b"}
        listening={false}
      />
    </>
  );
}
