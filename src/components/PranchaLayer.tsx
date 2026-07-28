"use client";

import { useState } from "react";
import { Layer, Group, Rect, Text, Circle } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useCadStore } from "@/lib/store";
import { ViewportShape } from "./ViewportShape";
import { dimensoesFolhaOrientada, MARGENS_ABNT } from "@/lib/types";
import type { Camada, Geometria, ViewportGeometria, XRef } from "@/lib/types";

interface PranchaLayerProps {
  /** Escala do Stage principal (px de tela por mm de papel). */
  scale: number;
}

/**
 * PranchaLayer
 * -----------------------------------------------------------------------
 * Desenha uma Prancha (Layout) quando ela está ativa (`prenchaAtivaId` no
 * store): a moldura + margem ABNT do formato dela, e a lista de
 * `Prancha.viewports` (Iteração 12g -- antes, Iteração 12e, era 1 câmera
 * única cobrindo a página inteira; agora várias janelas independentes,
 * cada uma reaproveitando `ViewportShape.tsx`, o MESMO componente usado
 * pelos viewports MV clássicos do Desenho, Sprint 5) -- cada uma
 * espelhando SOMENTE-LEITURA um pedaço/escala do Desenho
 * (`projeto.geometria` + `xrefs`) através da própria câmera local dela.
 *
 * Sem grid infinito/eixos (ao contrário do `GridLayer` do Desenho) --
 * Paper Space não precisa disso.
 *
 * Cada Viewport pode ser selecionado (clique na borda), movido (arraste
 * do corpo inteiro) e redimensionado (arraste de um dos 4 cantos) --
 * mecanismo PRÓPRIO e mais simples que o sistema genérico de grips do
 * Desenho (`GeometryLayer.tsx`/`store.ts#iniciarStretch`/`aplicarStretch`),
 * usando `draggable` nativo do Konva (ver `PranchaViewport` abaixo) --
 * "a tecla mover deve me dar a opcao de clicar com o mouse sobre um
 * bloco... e arrastar... até eu soltar", pedido do usuário, satisfeito
 * aqui especificamente pra Viewports de Prancha.
 *
 * O carimbo é desenhado à parte por `TitleBlockLayer`, sempre a partir do
 * `projeto.carimbo` COMPARTILHADO (Iteração 12g -- reverte o carimbo
 * próprio por Prancha da 12e).
 * -----------------------------------------------------------------------
 */
export function PranchaLayer({ scale }: PranchaLayerProps) {
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);
  const pranchas = useCadStore((s) => s.projeto.pranchas);
  const geometria = useCadStore((s) => s.projeto.geometria);
  const xrefs = useCadStore((s) => s.projeto.xrefs);
  const camadas = useCadStore((s) => s.projeto.camadas);
  const viewportAtivoId = useCadStore((s) => s.viewportAtivoId);
  const viewportPranchaSelecionadoId = useCadStore((s) => s.viewportPranchaSelecionadoId);
  const selecionarViewportPrancha = useCadStore((s) => s.selecionarViewportPrancha);
  const atualizarViewportDaPrancha = useCadStore((s) => s.atualizarViewportDaPrancha);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const prancha = pranchas.find((pr) => pr.id === prenchaAtivaId);
  // Iteração 12v: seleção/mover/redimensionar de um Viewport só deve
  // "roubar" o clique quando a ferramenta ativa é Selecionar -- pedido
  // do usuário: "o botao de zoom window nao esta funcionando dentro da
  // viewport na prancha". Causa raiz: o Rect/ViewportShape de cada
  // PranchaViewport interceptava (`cancelBubble`) QUALQUER clique
  // dentro dos limites do retângulo, sem checar a ferramenta ativa --
  // então os 2 cliques do ZOOM WINDOW (ou do próprio botão Viewport,
  // pra inserir um novo) nunca chegavam a `CanvasStage.tsx#
  // handleStageClick` quando caíam em cima de um viewport já existente.
  const interativo = ferramenta === "selecionar";

  if (!prancha) return null;

  const folha = dimensoesFolhaOrientada(prancha.formato, prancha.orientacao);
  const folhaX = -folha.largura / 2;
  const folhaY = -folha.altura / 2;
  const utilX = folhaX + MARGENS_ABNT.esquerda;
  const utilY = folhaY + MARGENS_ABNT.superior;
  const larguraUtil = folha.largura - MARGENS_ABNT.esquerda - MARGENS_ABNT.direita;
  const alturaUtil = folha.altura - MARGENS_ABNT.superior - MARGENS_ABNT.inferior;

  return (
    <>
      <Layer listening={false}>
        <Rect x={folhaX} y={folhaY} width={folha.largura} height={folha.altura} stroke="#6b7280" strokeWidth={1.5 / scale} fill="#ffffff" />
        <Rect x={utilX} y={utilY} width={larguraUtil} height={alturaUtil} stroke="#9ca3af" strokeWidth={1 / scale} />
        <Text
          x={folhaX}
          y={folhaY - 14 / scale}
          text={`${prancha.nome} — Folha ${prancha.formato}${prancha.orientacao === "retrato" ? " (retrato)" : ""} (${folha.largura} x ${folha.altura} mm)${
            prancha.viewports.length === 0 ? " — sem viewports (use o botão Viewport)" : ""
          }`}
          fontSize={11 / scale}
          fill="#6b7280"
        />
      </Layer>

      <Layer>
        {prancha.viewports.map((v) => (
          <PranchaViewport
            key={v.id}
            geo={v}
            geometriaCompleta={geometria}
            camadas={camadas}
            xrefs={xrefs}
            scale={scale}
            interativo={interativo}
            selecionado={viewportPranchaSelecionadoId === v.id}
            ativo={viewportAtivoId === v.id}
            onSelecionar={() => selecionarViewportPrancha(v.id)}
            onAtualizar={(patch) => atualizarViewportDaPrancha(prancha.id, v.id, patch)}
          />
        ))}
      </Layer>
    </>
  );
}

interface PranchaViewportProps {
  geo: ViewportGeometria;
  geometriaCompleta: Geometria[];
  camadas: Record<string, Camada>;
  xrefs: XRef[];
  scale: number;
  /** Iteração 12v -- `ferramenta === "selecionar"`, ver comentário em `PranchaLayer`. */
  interativo: boolean;
  selecionado: boolean;
  ativo: boolean;
  onSelecionar: () => void;
  onAtualizar: (patch: Partial<Pick<ViewportGeometria, "x" | "y" | "largura" | "altura">>) => void;
}

/** Os 4 cantos redimensionáveis -- cada um arrasta mantendo o canto OPOSTO fixo. */
const CANTOS = ["nw", "ne", "sw", "se"] as const;
type Canto = (typeof CANTOS)[number];

/**
 * PranchaViewport
 * -----------------------------------------------------------------------
 * Envolve `ViewportShape` (somente-leitura) com movimentação/redimensio-
 * namento próprios: um `Group` `draggable` pro corpo inteiro (mover) +
 * 4 `Circle` `draggable` nos cantos, visíveis só quando selecionado (pra
 * redimensionar). Ambos usam estado LOCAL (`overrideRect`) durante o
 * arraste para dar feedback visual ao vivo sem escrever no store a cada
 * pixel (mesmo espírito de outros previews do app) -- só confirma
 * (`onAtualizar`) no `onDragEnd`.
 *
 * O `Group` de movimentação é sempre renderizado com `x={0} y={0}`
 * (controlado) -- crucial para o Konva/react-konva "devolver" a posição
 * pro (0,0) depois de cada commit (o novo `geo.x/y` já reflete o
 * deslocamento), em vez de acumular um offset residual por cima do já
 * persistido.
 * -----------------------------------------------------------------------
 */
function PranchaViewport({ geo, geometriaCompleta, camadas, xrefs, scale, interativo, selecionado, ativo, onSelecionar, onAtualizar }: PranchaViewportProps) {
  const [overrideRect, setOverrideRect] = useState<{ x: number; y: number; largura: number; altura: number } | null>(null);
  const rect = overrideRect ?? { x: geo.x, y: geo.y, largura: geo.largura, altura: geo.altura };
  const geoExibido: ViewportGeometria = overrideRect ? { ...geo, ...overrideRect } : geo;

  // Iteração 12v: só intercepta o clique (seleciona + `cancelBubble`)
  // com a ferramenta Selecionar ativa -- pedido do usuário ("zoom
  // window nao esta funcionando dentro da viewport"). Com QUALQUER
  // outra ferramenta (Viewport, Zoom Window), o clique precisa CONTINUAR
  // subindo até `CanvasStage.tsx#handleStageClick` (por isso não seta
  // `cancelBubble` neste caso) -- é lá que o 2º clique do Zoom Window
  // (ou o 1º/2º clique de inserir um novo Viewport) é de fato tratado,
  // mesmo que caia visualmente em cima de um viewport já existente.
  function handleClickBorda(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!interativo) return;
    e.cancelBubble = true;
    onSelecionar();
  }

  // Iteração 12v: impede que o mousedown/touchstart do corpo/canto
  // TAMBÉM dispare o registro de seleção-por-caixa do Stage por baixo
  // (`CanvasStage.tsx#handleMouseDown` registra em QUALQUER mousedown
  // esquerdo com a ferramenta Selecionar ativa, "mesmo em cima de uma
  // forma existente") -- mesmo bug já encontrado e corrigido pro XREF
  // na Iteração 12u (ver `XrefLayer.tsx`): sem isso, arrastar o
  // corpo/canto de um Viewport também deixava um rastro
  // (`boxSelectJustFinishedRef`) que fazia o PRÓXIMO clique em área
  // vazia (pra desselecionar) ser ignorado silenciosamente. Só corta o
  // botão ESQUERDO -- um pan com botão direito/meio precisa continuar
  // chegando ao Stage normalmente.
  function handleMouseDownCorpoOuCanto(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!interativo) return;
    if (!(e.evt instanceof MouseEvent) || e.evt.button === 0) e.cancelBubble = true;
  }

  // Iteração 12r: o `draggable` nativo do Konva inicia um arraste com
  // QUALQUER botão do mouse, não só o esquerdo -- mesma classe de bug já
  // documentada pro "click" sintético (ver Bugs relevantes na doc do
  // projeto). Sem esse filtro, um pan (botão do meio/direito, ver
  // `CanvasStage.tsx#handleMouseMove`) que comece sobre o corpo/canto de
  // um Viewport de Prancha era capturado pelo drag do PRÓPRIO viewport
  // em vez de mexer só a câmera interna (ou a página) -- reportado pelo
  // usuário como "o comando pan mexe toda a viewport de lugar". Cancela
  // o drag imediatamente (`stopDrag`) se o botão não for o principal (0),
  // deixando o evento seguir pro handler de pan do Stage normalmente.
  function ignorarDragComBotaoErrado(e: KonvaEventObject<DragEvent>) {
    if (e.evt instanceof MouseEvent && e.evt.button !== 0) {
      e.target.stopDrag();
    }
  }

  function handleCorpoDragMove(e: KonvaEventObject<DragEvent>) {
    const dx = e.target.x();
    const dy = e.target.y();
    setOverrideRect({ x: geo.x + dx, y: geo.y + dy, largura: geo.largura, altura: geo.altura });
  }

  function handleCorpoDragEnd(e: KonvaEventObject<DragEvent>) {
    const dx = e.target.x();
    const dy = e.target.y();
    e.target.position({ x: 0, y: 0 });
    setOverrideRect(null);
    if (dx !== 0 || dy !== 0) onAtualizar({ x: geo.x + dx, y: geo.y + dy });
  }

  function handleCantoDragMove(canto: Canto) {
    return (e: KonvaEventObject<DragEvent>) => {
      const px = e.target.x();
      const py = e.target.y();
      // Canto OPOSTO fica fixo -- os dois definem o novo retângulo (min/max, nunca invertido).
      const fixoX = canto === "nw" || canto === "sw" ? geo.x + geo.largura : geo.x;
      const fixoY = canto === "nw" || canto === "ne" ? geo.y + geo.altura : geo.y;
      const novoX = Math.min(fixoX, px);
      const novoY = Math.min(fixoY, py);
      const novaLargura = Math.max(1, Math.abs(fixoX - px));
      const novaAltura = Math.max(1, Math.abs(fixoY - py));
      setOverrideRect({ x: novoX, y: novoY, largura: novaLargura, altura: novaAltura });
    };
  }

  function handleCantoDragEnd() {
    if (overrideRect) onAtualizar(overrideRect);
    setOverrideRect(null);
  }

  const raioHandle = Math.max(3.5 / scale, 1.2);

  return (
    <>
      <Group
        x={0}
        y={0}
        draggable={interativo}
        onMouseDown={handleMouseDownCorpoOuCanto}
        onTouchStart={handleMouseDownCorpoOuCanto}
        onDragStart={ignorarDragComBotaoErrado}
        onDragMove={handleCorpoDragMove}
        onDragEnd={handleCorpoDragEnd}
      >
        {/* Retângulo invisível cobrindo o corpo INTEIRO do viewport (não só
            a borda) -- alvo de clique/arraste pra mover, já que o conteúdo
            espelhado por dentro (`desenharSomenteLeitura`) tem
            `listening={false}` e a borda do `ViewportShape` sozinha só
            reagiria bem perto do traço. `opacity={0}` esconde
            visualmente sem desativar o hit-test do Konva (que roda numa
            camada separada, independente de opacidade). */}
        <Rect x={geo.x} y={geo.y} width={geo.largura} height={geo.altura} fill="#000000" opacity={0} onClick={handleClickBorda} onTap={handleClickBorda} />
        <ViewportShape
          geo={geoExibido}
          geometriaCompleta={geometriaCompleta}
          camadas={camadas}
          xrefs={xrefs}
          scale={scale}
          selecionado={selecionado}
          ativo={ativo}
          onClick={handleClickBorda}
        />
      </Group>

      {selecionado &&
        interativo &&
        CANTOS.map((canto) => {
          const cx = canto === "nw" || canto === "sw" ? rect.x : rect.x + rect.largura;
          const cy = canto === "nw" || canto === "ne" ? rect.y : rect.y + rect.altura;
          return (
            <Circle
              key={canto}
              x={cx}
              y={cy}
              radius={raioHandle}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1 / scale}
              draggable
              onMouseDown={handleMouseDownCorpoOuCanto}
              onTouchStart={handleMouseDownCorpoOuCanto}
              onDragStart={ignorarDragComBotaoErrado}
              onDragMove={handleCantoDragMove(canto)}
              onDragEnd={handleCantoDragEnd}
              onClick={(e) => {
                e.cancelBubble = true;
              }}
            />
          );
        })}
    </>
  );
}
