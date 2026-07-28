"use client";

import { Image as KonvaImage, Rect } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useImage } from "@/lib/useImage";
import { blockToDataUri, getBlockDef } from "@/lib/blocks";
import type { BlocoGeometria, Camada } from "@/lib/types";

interface BlocoShapeProps {
  geo: BlocoGeometria;
  scale: number;
  selecionado: boolean;
  onClick: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /**
   * Camada do bloco (Iteração 12f, opcional pra não quebrar os poucos
   * outros usos deste componente que não têm uma camada à mão -- ex.:
   * prévias). Quando presente, `camada.espessuraDaLinha` é usada pra
   * reescalar o traço do SVG do bloco (ver `reescalarEspessuras` em
   * `lib/blocks.ts`), pra bater com a espessura das demais linhas da
   * mesma camada -- antes disso, todo bloco saía sempre com a espessura
   * fixa "cravada" no SVG de `lib/blocks.ts`, ignorando a camada.
   */
  camada?: Camada;
}

/**
 * BlocoShape
 * -----------------------------------------------------------------------
 * Renderiza um bloco elétrico "carimbado" (disjuntor, transformador,
 * tomada...) no canvas, convertendo o SVG da biblioteca em uma imagem
 * Konva. Centralizado no ponto de inserção (x, y), como um INSERT de
 * bloco no AutoCAD.
 * -----------------------------------------------------------------------
 */
/** Espessura de traço (em unidades do viewBox 0-100) usada como referência na maioria dos SVGs de `lib/blocks.ts` -- ver `reescalarEspessuras`. */
const ESPESSURA_BASE_VIEWBOX = 4;

export function BlocoShape({ geo, scale, selecionado, onClick, camada }: BlocoShapeProps) {
  const def = getBlockDef(geo.nome);

  // Fator de reescala do traço do bloco (Iteração 12f): calibrado pra
  // bater com a espessura da camada em mm de mundo na escala de
  // referência 1:1 (100% de zoom, onde 1mm de mundo = 1px de tela --
  // mesma convenção usada pelas linhas vetoriais em `GeometryLayer.tsx`,
  // que dividem `espessuraDaLinha` pelo `scale` do Stage pra ficar
  // sempre com largura constante em TELA). O bloco em si não tem esse
  // mesmo truque (é uma imagem rasterizada do SVG, escalada junto com o
  // resto do desenho pelo zoom do Stage, não compensada) -- então o
  // traço do bloco bate exatamente com o das linhas em 100% de zoom, e
  // diverge um pouco em zooms muito diferentes disso (limitação aceitável
  // da arquitetura de bloco-como-imagem, não corrigida aqui).
  const fatorEspessura =
    camada && def ? (camada.espessuraDaLinha * (100 / def.largura)) / ESPESSURA_BASE_VIEWBOX : 1;
  const img = useImage(def ? blockToDataUri(def, fatorEspessura) : undefined);

  if (!def) return null;

  // `escalaX`/`escalaY` (Sprint 3, controle independente por eixo pela
  // barra de propriedades) têm prioridade sobre o antigo `escala`
  // (uniforme) -- fallback pra blocos salvos antes dessa mudança.
  const largura = def.largura * (geo.escalaX ?? geo.escala ?? 1);
  const altura = def.altura * (geo.escalaY ?? geo.escala ?? 1);

  return (
    <>
      {selecionado && (
        <Rect
          x={geo.x - largura / 2 - 2 / scale}
          y={geo.y - altura / 2 - 2 / scale}
          width={largura + 4 / scale}
          height={altura + 4 / scale}
          stroke="#2563eb"
          dash={[4 / scale, 3 / scale]}
          strokeWidth={1 / scale}
          listening={false}
        />
      )}
      {img && (
        <KonvaImage
          image={img}
          x={geo.x}
          y={geo.y}
          width={largura}
          height={altura}
          offsetX={largura / 2}
          offsetY={altura / 2}
          rotation={geo.rotacao ?? 0}
          onClick={onClick}
          onTap={onClick}
        />
      )}
    </>
  );
}
