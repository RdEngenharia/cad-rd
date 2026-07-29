"use client";

import { Shape } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { ArcoGeometria } from "@/lib/types";

interface ArcoShapeProps {
  geo: ArcoGeometria;
  stroke: string;
  strokeWidth: number;
  hitStrokeWidth: number;
  onClick: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /** Padrão de traço tracejado (herdado da camada, ver `dashDaCamada` em GeometryLayer.tsx) -- ausente = contínuo. */
  dash?: number[];
  /** Iteração 41 -- hover vermelho do Apagar (ver `GeometryLayer.tsx`), repassado igual a `onClick`. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * ArcoShape
 * -----------------------------------------------------------------------
 * Desenha um arco circular (só criado pelo comando FILLET/Concordância
 * com raio > 0 -- ver `aplicarFillet` em store.ts) usando um
 * `Konva.Shape` com `sceneFunc` próprio: chama `context.arc(...)` +
 * `context.strokeShape(shape)` direto na API nativa do Canvas 2D, em
 * vez de tentar encaixar num componente pronto do Konva (o `Konva.Arc`
 * embutido desenha uma "fatia de pizza" fechada até o centro, que não é
 * o que queremos aqui -- só o traço do arco).
 * -----------------------------------------------------------------------
 */
export function ArcoShape({ geo, stroke, strokeWidth, hitStrokeWidth, onClick, dash, onMouseEnter, onMouseLeave }: ArcoShapeProps) {
  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        context.arc(geo.x, geo.y, geo.raio, (geo.anguloInicial * Math.PI) / 180, (geo.anguloFinal * Math.PI) / 180, false);
        context.strokeShape(shape);
      }}
      stroke={stroke}
      strokeWidth={strokeWidth}
      hitStrokeWidth={hitStrokeWidth}
      dash={dash}
      onClick={onClick}
      onTap={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
