"use client";

import { useState } from "react";
import { Layer, Group, Image as KonvaImage, Rect, Text, Circle } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useCadStore } from "@/lib/store";
import { useImage } from "@/lib/useImage";
import type { XRef } from "@/lib/types";

/**
 * XrefLayer
 * -----------------------------------------------------------------------
 * Renderiza as referências externas (imagens/PDFs importados) como fundo
 * do canvas -- o equivalente ao XREF/IMAGEATTACH do AutoCAD. O binário
 * nunca é salvo no Firestore: só x/y/escala (ver lib/firebase.ts). O
 * `objectUrl` usado aqui é um Blob URL válido apenas nesta sessão do
 * navegador (recriado a partir do IndexedDB quando necessário).
 *
 * Seleção/mover/redimensionar (Iteração 12u): pedido do usuário -- "nao
 * consigo selecionar e mover uma imagem que importei, [...] ela preciza
 * ter um retangulo em volta que mostre a quina quando eu for mover ela,
 * assim como no autocad". Antes, a `Layer` inteira nascia com
 * `listening={false}` -- um XREF nunca recebia NENHUM evento de
 * ponteiro, então clicar nele não fazia nada (só dava pra ajustar
 * posição/escala indiretamente, via a ferramenta Calibrar por 2 pontos
 * de referência, Iteração 3). Agora a Layer escuta só quando a
 * ferramenta ativa é "selecionar" (mesmo precedente dos grips de
 * geometria em `GeometryLayer.tsx` -- só aparecem/reagem nesse modo), e
 * cada XREF ganha um mecanismo PRÓPRIO de seleção/mover/redimensionar,
 * mesmo espírito (e código bem parecido, com `draggable` nativo do
 * Konva) do já usado pelos Viewports de Prancha desde a Iteração 12g
 * (ver `PranchaLayer.tsx`): clique seleciona (retângulo azul + 4
 * "quinas" aparecem em volta), arrastar o corpo move, arrastar uma quina
 * redimensiona -- como `XRef.escala` é um único fator pros dois eixos
 * (largura/altura vêm de `largura_px`/`altura_px` fixos, sem dimensões
 * independentes), o redimensionamento por canto é sempre uniforme
 * (preserva a proporção original da imagem), calculado pela distância
 * diagonal até o canto OPOSTO (que fica fixo), não por eixo isolado.
 * -----------------------------------------------------------------------
 */
export function XrefLayer() {
  const xrefs = useCadStore((s) => s.projeto.xrefs);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const xrefSelecionadoId = useCadStore((s) => s.xrefSelecionadoId);
  const selecionarXref = useCadStore((s) => s.selecionarXref);
  const updateXref = useCadStore((s) => s.updateXref);
  // XrefLayer só é renderizada no Desenho (nunca dentro de uma Prancha --
  // lá o conteúdo é espelhado somente-leitura por `ViewportShape.tsx`),
  // então `viewport` (a câmera do Desenho) é sempre a certa aqui, sem
  // precisar do `viewportAtual` derivado que `CanvasStage.tsx` usa.
  const scale = useCadStore((s) => s.viewport.scale);

  const selecionavel = ferramenta === "selecionar";

  return (
    <Layer listening={selecionavel}>
      {xrefs.map((x) => (
        <XrefImage
          key={x.id}
          xref={x}
          scale={scale}
          draggavel={selecionavel}
          selecionado={selecionavel && xrefSelecionadoId === x.id}
          onSelecionar={() => selecionarXref(x.id)}
          onAtualizar={(patch) => updateXref(x.id, patch)}
        />
      ))}
    </Layer>
  );
}

interface XrefImageProps {
  xref: XRef;
  scale: number;
  draggavel: boolean;
  selecionado: boolean;
  onSelecionar: () => void;
  onAtualizar: (patch: Partial<Pick<XRef, "x" | "y" | "escala">>) => void;
}

/** Os 4 cantos redimensionáveis -- cada um arrasta mantendo o canto OPOSTO fixo. */
const CANTOS = ["nw", "ne", "sw", "se"] as const;
type Canto = (typeof CANTOS)[number];

// Iteração 12u: o `draggable` nativo do Konva inicia um arraste com
// QUALQUER botão do mouse, não só o esquerdo -- mesma classe de bug já
// corrigida pro corpo/cantos de um Viewport de Prancha na Iteração 12s
// (ver `PranchaLayer.tsx`), reaplicada aqui pelo mesmo motivo: sem esse
// filtro, um pan (botão do meio/direito) que comece sobre a imagem
// arrastaria a IMAGEM em vez de mover a câmera do Desenho.
function ignorarDragComBotaoErrado(e: KonvaEventObject<DragEvent>) {
  if (e.evt instanceof MouseEvent && e.evt.button !== 0) {
    e.target.stopDrag();
  }
}

function XrefImage({ xref, scale, draggavel, selecionado, onSelecionar, onAtualizar }: XrefImageProps) {
  const img = useImage(xref.objectUrl);
  // Preview local durante o arraste (mesmo espírito de `PranchaViewport`
  // em `PranchaLayer.tsx`): dá feedback visual ao vivo sem escrever no
  // store a cada pixel -- só confirma (`onAtualizar`) no fim do gesto.
  const [overrideXY, setOverrideXY] = useState<{ x: number; y: number } | null>(null);
  const [overrideEscala, setOverrideEscala] = useState<{ x: number; y: number; escala: number } | null>(null);

  if (xref.visivel === false) return null;

  // Iteração 20: existiam DOIS pontos independentes acompanhando a posição
  // durante o arraste -- este estado (`overrideXY`/`overrideEscala`, usado
  // pelo contorno/quinas de seleção abaixo, que ficam FORA do `Group`
  // arrastável) E o próprio deslocamento NATIVO do Konva no `Group`
  // `draggable` (que já move visualmente tudo que está DENTRO dele --
  // sozinho, sem precisar de nenhum estado React). A versão anterior
  // aplicava os dois AO MESMO TEMPO na imagem (que fica DENTRO do Group):
  // a cada pixel arrastado, a imagem andava o dobro do que o mouse de fato
  // moveu (deslocamento nativo do Group + o mesmo delta somado de novo via
  // `xExibido`), enquanto o contorno de seleção (que só tem o estado, sem
  // nenhum Group por baixo) se movia na velocidade certa -- daí a imagem
  // "sair de dentro do contorno" quase imediatamente ao arrastar, e as
  // quinas pararem de corresponder às bordas reais da imagem (relatado
  // pelo usuário: precisava arrastar pelo meio, e o contorno/quinas
  // pareciam não acompanhar). Corrigido separando os dois casos: durante
  // um arraste do CORPO (`overrideXY`), a imagem usa sempre a posição BASE
  // (`xref.x`/`xref.y`) -- o próprio Group nativo já cuida do
  // deslocamento visual sozinho; só o contorno/quinas (fora do Group)
  // precisam do estado pra acompanhar. Durante um arraste de CANTO
  // (`overrideEscala`, redimensionar), não existe transform nativo
  // rolando (só o círculo do canto se move, não o Group inteiro) -- aí sim
  // a imagem precisa ler o override pra refletir o novo tamanho ao vivo.
  const xImagem = overrideEscala?.x ?? xref.x;
  const yImagem = overrideEscala?.y ?? xref.y;
  const xExibido = overrideEscala?.x ?? overrideXY?.x ?? xref.x;
  const yExibido = overrideEscala?.y ?? overrideXY?.y ?? xref.y;
  const escalaExibida = overrideEscala?.escala ?? xref.escala;
  const largura = xref.largura_px * escalaExibida;
  const altura = xref.altura_px * escalaExibida;

  function handleClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
    e.cancelBubble = true;
    onSelecionar();
  }

  function handleCorpoDragStart(e: KonvaEventObject<DragEvent>) {
    ignorarDragComBotaoErrado(e);
    onSelecionar();
  }

  function handleCorpoDragMove(e: KonvaEventObject<DragEvent>) {
    setOverrideXY({ x: xref.x + e.target.x(), y: xref.y + e.target.y() });
  }

  function handleCorpoDragEnd(e: KonvaEventObject<DragEvent>) {
    const dx = e.target.x();
    const dy = e.target.y();
    e.target.position({ x: 0, y: 0 });
    setOverrideXY(null);
    if (dx !== 0 || dy !== 0) onAtualizar({ x: xref.x + dx, y: xref.y + dy });
  }

  function handleCantoDragMove(canto: Canto) {
    return (e: KonvaEventObject<DragEvent>) => {
      const px = e.target.x();
      const py = e.target.y();
      const larguraOriginal = xref.largura_px * xref.escala;
      const alturaOriginal = xref.altura_px * xref.escala;
      // Canto OPOSTO fica fixo -- a nova escala vem da distância diagonal
      // até esse ponto fixo (preserva a proporção original da imagem,
      // já que `XRef.escala` não tem X/Y independentes).
      const fixoX = canto === "nw" || canto === "sw" ? xref.x + larguraOriginal : xref.x;
      const fixoY = canto === "nw" || canto === "ne" ? xref.y + alturaOriginal : xref.y;
      const diagBase = Math.hypot(xref.largura_px, xref.altura_px);
      const diagAtual = Math.hypot(px - fixoX, py - fixoY);
      const escalaNova = Math.max(diagAtual / diagBase, 0.001);
      const novaLargura = xref.largura_px * escalaNova;
      const novaAltura = xref.altura_px * escalaNova;
      const novoX = canto === "nw" || canto === "sw" ? fixoX - novaLargura : fixoX;
      const novoY = canto === "nw" || canto === "ne" ? fixoY - novaAltura : fixoY;
      setOverrideEscala({ x: novoX, y: novoY, escala: escalaNova });
    };
  }

  function handleCantoDragEnd() {
    if (overrideEscala) onAtualizar({ x: overrideEscala.x, y: overrideEscala.y, escala: overrideEscala.escala });
    setOverrideEscala(null);
  }

  const raioHandle = Math.max(3.5 / scale, 1.2);

  return (
    <>
      <Group
        x={0}
        y={0}
        draggable={draggavel}
        // Impede que este MESMO mousedown/touchstart também dispare o
        // início de uma seleção por caixa no Stage por baixo da imagem
        // (`CanvasStage.tsx#handleMouseDown` registra `selecaoDragRef`
        // em QUALQUER clique esquerdo com a ferramenta Selecionar ativa,
        // "mesmo em cima de uma forma existente") -- mesmo padrão já
        // usado pelos grips de geometria (`GeometryLayer.tsx#
        // handleGripMouseDown`) e necessário aqui pelo mesmo motivo: sem
        // isso, arrastar o corpo do XREF também armava (e, ao soltar,
        // "confirmava") uma seleção por caixa fantasma por trás, cujo
        // rastro (`boxSelectJustFinishedRef`) fazia o PRÓXIMO clique em
        // área vazia ser ignorado silenciosamente -- inclusive o clique
        // que deveria desselecionar o XREF. Só corta o botão ESQUERDO
        // (0) -- um pan com botão direito/meio começando sobre a imagem
        // precisa continuar chegando ao Stage normalmente (mesma
        // ressalva já aplicada ao filtro de `draggable` por botão desde
        // a Iteração 12s).
        onMouseDown={(e) => {
          if (!(e.evt instanceof MouseEvent) || e.evt.button === 0) e.cancelBubble = true;
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={handleCorpoDragStart}
        onDragMove={handleCorpoDragMove}
        onDragEnd={handleCorpoDragEnd}
        onClick={handleClick}
        onTap={handleClick}
      >
        {!img ? (
          // Placeholder enquanto a imagem carrega (ou se o Blob URL expirou).
          <>
            <Rect x={xImagem} y={yImagem} width={largura} height={altura} stroke="#cbd5e1" dash={[4, 4]} fill="#ffffff" />
            <Text
              x={xImagem + 4}
              y={yImagem + 4}
              text={`XREF: ${xref.nome_arquivo} (carregando...)`}
              fontSize={10}
              fill="#94a3b8"
            />
          </>
        ) : (
          <KonvaImage
            image={img}
            x={xImagem}
            y={yImagem}
            width={largura}
            height={altura}
            // Iteração 12f (pedido do usuário -- "a imagem nao esconde as
            // linhas no fundo preenchendo todo campo"): antes a imagem de
            // fundo saía sempre com 92% de opacidade "cravado", deixando a
            // grade do canvas vazar visualmente por baixo dela em toda a
            // área ocupada -- opaca (100%) por padrão agora, igual o
            // comportamento padrão do IMAGEATTACH do AutoCAD (a imagem
            // realmente cobre o que está atrás, sem precisar de um "fade"
            // manual).
            opacity={1}
          />
        )}
      </Group>

      {/* Retângulo de seleção + "quinas" (Iteração 12u): mostrado só com
          o XREF selecionado -- mesmo padrão visual dos grips de geometria
          (`GeometryLayer.tsx`) e dos cantos de Viewport de Prancha
          (`PranchaLayer.tsx`), cor azul consistente com o resto do app.
          Fica visível durante TODO o arraste (não só ao soltar), dando
          exatamente a referência de "quina" que o usuário pediu pra
          alinhar a imagem contra outro desenho. */}
      {selecionado && (
        <>
          <Rect x={xExibido} y={yExibido} width={largura} height={altura} stroke="#2563eb" strokeWidth={1.5 / scale} dash={[6 / scale, 4 / scale]} listening={false} />
          {CANTOS.map((canto) => {
            const cx = canto === "nw" || canto === "sw" ? xExibido : xExibido + largura;
            const cy = canto === "nw" || canto === "ne" ? yExibido : yExibido + altura;
            return (
              <Circle
                key={canto}
                x={cx}
                y={cy}
                radius={raioHandle}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={1 / scale}
                draggable={draggavel}
                onMouseDown={(e) => {
                  if (!(e.evt instanceof MouseEvent) || e.evt.button === 0) e.cancelBubble = true;
                }}
                onTouchStart={(e) => {
                  e.cancelBubble = true;
                }}
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
      )}
    </>
  );
}
